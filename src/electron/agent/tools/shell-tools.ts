import { spawn, ChildProcess, execSync } from 'child_process';
import { Workspace, CommandTerminationReason } from '../../../shared/types';
import { AgentDaemon } from '../daemon';
import { GuardrailManager } from '../../guardrails/guardrail-manager';

// Limits to prevent runaway commands
const MAX_TIMEOUT = 5 * 60 * 1000; // 5 minutes max
const DEFAULT_TIMEOUT = 60 * 1000; // 1 minute default
const MAX_OUTPUT_SIZE = 100 * 1024; // 100KB max output

/**
 * Validate that a PID is a safe positive integer
 * Prevents command injection if PID is somehow not a number
 */
function isValidPid(pid: unknown): pid is number {
  return typeof pid === 'number' &&
    Number.isInteger(pid) &&
    pid > 0 &&
    pid <= 4194304; // Max PID on Linux (can be configured higher, but this is safe default)
}

/**
 * Check if a process with the given PID exists and is owned by the current user
 * Returns false if the process doesn't exist or is owned by another user
 */
function isProcessOwnedByCurrentUser(pid: number): boolean {
  if (!isValidPid(pid)) return false;

  try {
    // Use kill with signal 0 to check if process exists and we have permission to signal it
    // This will throw EPERM if process exists but is owned by another user
    // This will throw ESRCH if process doesn't exist
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    // ESRCH = no such process (that's fine, process exited)
    // EPERM = permission denied (process exists but owned by another user - DON'T KILL)
    if (error.code === 'EPERM') {
      console.warn(`[ShellTools] Process ${pid} exists but is owned by another user, skipping`);
      return false;
    }
    // Process doesn't exist, that's fine
    return false;
  }
}

/**
 * Validate username for safe use in shell commands
 * Prevents command injection via USER environment variable
 */
function isValidUsername(username: string | undefined): username is string {
  if (!username) return false;
  // Username must be alphanumeric, underscore, or dash (standard POSIX username chars)
  // Max length 32 chars (common limit)
  return /^[a-zA-Z0-9_-]{1,32}$/.test(username);
}

/**
 * Get all descendant process IDs for a given parent PID
 * Uses pgrep to find child processes recursively
 * Only returns processes owned by the current user for security
 */
function getDescendantPids(parentPid: number): number[] {
  if (!isValidPid(parentPid)) {
    console.error(`[ShellTools] Invalid parent PID: ${parentPid}`);
    return [];
  }

  const currentUser = process.env.USER;
  // Validate username to prevent command injection
  const safeUser = isValidUsername(currentUser) ? currentUser : undefined;
  if (currentUser && !safeUser) {
    console.warn(`[ShellTools] Invalid USER env var: ${currentUser}, skipping user filter`);
  }

  const descendants: number[] = [];
  const toProcess: number[] = [parentPid];
  const seen = new Set<number>(); // Prevent infinite loops from circular references

  while (toProcess.length > 0) {
    const pid = toProcess.pop()!;
    if (seen.has(pid)) continue;
    seen.add(pid);

    try {
      // pgrep -P finds direct children of the given PID
      // Add -U $USER to only find processes owned by current user (security)
      const pgrepCmd = safeUser
        ? `pgrep -P ${pid} -U ${safeUser}`
        : `pgrep -P ${pid}`;

      const output = execSync(pgrepCmd, {
        encoding: 'utf-8',
        timeout: 1000,
        // Don't inherit env to avoid any injection via environment
        env: { PATH: '/usr/bin:/bin' },
      });

      const childPids = output.trim().split('\n')
        .filter(line => line.length > 0)
        .map(line => parseInt(line, 10))
        .filter(childPid => isValidPid(childPid) && !seen.has(childPid));

      descendants.push(...childPids);
      toProcess.push(...childPids);
    } catch {
      // pgrep returns non-zero if no children found, which is fine
    }
  }

  return descendants;
}

/**
 * Kill a process and all its descendants
 * Sends the signal to children first, then to the parent (bottom-up killing)
 * Only kills processes owned by the current user for security
 */
function killProcessTree(pid: number, signal: NodeJS.Signals): void {
  if (!isValidPid(pid)) {
    console.error(`[ShellTools] Refusing to kill invalid PID: ${pid}`);
    return;
  }

  const descendants = getDescendantPids(pid);

  // Kill descendants first (in reverse order, deepest children first)
  for (const descendantPid of descendants.reverse()) {
    // Double-check ownership before killing each process
    if (isProcessOwnedByCurrentUser(descendantPid)) {
      try {
        process.kill(descendantPid, signal);
      } catch {
        // Process may have already exited
      }
    }
  }

  // Kill the parent process (also verify ownership)
  if (isProcessOwnedByCurrentUser(pid)) {
    try {
      process.kill(pid, signal);
    } catch {
      // Process may have already exited
    }
  }
}

/**
 * ShellTools implements shell command execution with user approval
 */
export class ShellTools {
  // Track the currently running child process for stdin support
  private activeProcess: ChildProcess | null = null;
  // Track escalation timeouts so we can cancel them when process exits
  private escalationTimeouts: ReturnType<typeof setTimeout>[] = [];
  // Prevent multiple concurrent kill attempts
  private killInProgress = false;
  // Unique identifier for the current process session (prevents PID reuse issues)
  private processSessionId = 0;
  // Track user-initiated kills to signal termination reason to agent
  private userKillRequested = false;

  constructor(
    private workspace: Workspace,
    private daemon: AgentDaemon,
    private taskId: string
  ) {}

  /**
   * Update the workspace for this tool
   */
  setWorkspace(workspace: Workspace): void {
    this.workspace = workspace;
  }

  /**
   * Clear all pending escalation timeouts
   * Called when process exits to prevent killing reused PIDs
   */
  private clearEscalationTimeouts(): void {
    for (const timeout of this.escalationTimeouts) {
      clearTimeout(timeout);
    }
    this.escalationTimeouts = [];
    this.killInProgress = false;
  }

  /**
   * Send input to the currently running command's stdin
   */
  sendStdin(input: string): boolean {
    if (!this.activeProcess || !this.activeProcess.stdin || this.activeProcess.killed) {
      return false;
    }
    try {
      this.activeProcess.stdin.write(input);
      // Echo the input to show it was sent
      this.daemon.logEvent(this.taskId, 'command_output', {
        type: 'stdin',
        output: input,
      });
      return true;
    } catch (error) {
      console.error('Failed to write to stdin:', error);
      return false;
    }
  }

  /**
   * Check if a command is currently running
   */
  hasActiveProcess(): boolean {
    return this.activeProcess !== null && !this.activeProcess.killed;
  }

  /**
   * Kill the currently running command and all its child processes
   * @param force - If true, send SIGKILL immediately. Otherwise, try SIGINT first, then SIGTERM, then SIGKILL.
   */
  killProcess(force: boolean = false): boolean {
    if (!this.activeProcess || this.activeProcess.killed) {
      return false;
    }

    const pid = this.activeProcess.pid;
    if (!isValidPid(pid)) {
      console.error(`[ShellTools] Invalid PID for kill: ${pid}`);
      return false;
    }

    // Prevent multiple concurrent kill chains (security: avoid race conditions)
    if (this.killInProgress && !force) {
      console.log(`[ShellTools] Kill already in progress, ignoring duplicate request`);
      return true; // Return true since a kill is already underway
    }

    // Capture session ID to verify we're killing the right process in escalation timeouts
    const currentSessionId = this.processSessionId;

    // Mark this as a user-initiated kill so the close handler can signal the agent
    this.userKillRequested = true;

    if (force) {
      // Force kill - immediate SIGKILL to entire process tree
      // Clear any pending escalation timeouts first
      this.clearEscalationTimeouts();

      try {
        killProcessTree(pid, 'SIGKILL');
        this.daemon.logEvent(this.taskId, 'command_output', {
          type: 'error',
          output: '\n[Process tree force killed by user]\n',
        });
        return true;
      } catch (error) {
        console.error('Failed to force kill process tree:', error);
        return false;
      }
    }

    // Mark kill as in progress to prevent duplicate escalation chains
    this.killInProgress = true;

    try {
      // Send SIGINT (Ctrl+C) to gracefully interrupt the process tree
      killProcessTree(pid, 'SIGINT');
      this.daemon.logEvent(this.taskId, 'command_output', {
        type: 'error',
        output: '\n^C [Process tree interrupted by user]\n',
      });

      // Set up escalation: if still running after 2s, send SIGTERM to tree
      // If still running after 4s, send SIGKILL to tree
      // These timeouts are tracked so they can be cancelled if process exits
      const childProcess = this.activeProcess;

      const sigtermTimeout = setTimeout(() => {
        // Verify this is still the same process session (prevents PID reuse attacks)
        if (currentSessionId !== this.processSessionId) {
          console.log(`[ShellTools] Session ID mismatch, skipping SIGTERM escalation`);
          return;
        }
        if (childProcess && !childProcess.killed && childProcess.pid === pid) {
          // Additional safety: verify we own this process before killing
          if (!isProcessOwnedByCurrentUser(pid)) {
            console.warn(`[ShellTools] Process ${pid} no longer owned by current user, skipping SIGTERM`);
            return;
          }
          try {
            killProcessTree(pid, 'SIGTERM');
            this.daemon.logEvent(this.taskId, 'command_output', {
              type: 'error',
              output: '[Escalating to SIGTERM for process tree...]\n',
            });
          } catch { /* Process may have exited */ }
        }
      }, 2000);
      this.escalationTimeouts.push(sigtermTimeout);

      const sigkillTimeout = setTimeout(() => {
        // Verify this is still the same process session (prevents PID reuse attacks)
        if (currentSessionId !== this.processSessionId) {
          console.log(`[ShellTools] Session ID mismatch, skipping SIGKILL escalation`);
          return;
        }
        if (childProcess && !childProcess.killed && childProcess.pid === pid) {
          // Additional safety: verify we own this process before killing
          if (!isProcessOwnedByCurrentUser(pid)) {
            console.warn(`[ShellTools] Process ${pid} no longer owned by current user, skipping SIGKILL`);
            return;
          }
          try {
            killProcessTree(pid, 'SIGKILL');
            this.daemon.logEvent(this.taskId, 'command_output', {
              type: 'error',
              output: '[Escalating to SIGKILL for process tree...]\n',
            });
          } catch { /* Process may have exited */ }
        }
      }, 4000);
      this.escalationTimeouts.push(sigkillTimeout);

      return true;
    } catch (error) {
      console.error('Failed to kill process tree:', error);
      this.killInProgress = false;

      // Try SIGTERM as fallback
      try {
        killProcessTree(pid, 'SIGTERM');
        return true;
      } catch {
        // Last resort: SIGKILL
        try {
          killProcessTree(pid, 'SIGKILL');
          return true;
        } catch {
          return false;
        }
      }
    }
  }

  /**
   * Execute a shell command (requires user approval)
   * Note: We don't check workspace.permissions.shell here because
   * shell commands always require explicit user approval via requestApproval()
   */
  async runCommand(
    command: string,
    options?: {
      cwd?: string;
      timeout?: number;
      env?: Record<string, string>;
    }
  ): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    truncated?: boolean;
  }> {
    // Check if command is blocked by guardrails BEFORE anything else
    const blockCheck = GuardrailManager.isCommandBlocked(command);
    if (blockCheck.blocked) {
      throw new Error(
        `Command blocked by guardrails: "${command}"\n` +
        `Matched pattern: ${blockCheck.pattern}\n` +
        `This command has been blocked for safety. You can modify blocked patterns in Settings > Guardrails.`
      );
    }

    // Check if command is trusted (auto-approve without user confirmation)
    const trustCheck = GuardrailManager.isCommandTrusted(command);
    let approved = false;

    if (trustCheck.trusted) {
      // Auto-approve trusted commands
      approved = true;
      this.daemon.logEvent(this.taskId, 'log', {
        message: `Auto-approved trusted command (matched: ${trustCheck.pattern})`,
        command,
      });
    } else {
      // Request user approval before executing
      approved = await this.daemon.requestApproval(
        this.taskId,
        'run_command',
        `Run command: ${command}`,
        {
          command,
          cwd: options?.cwd || this.workspace.path,
          timeout: options?.timeout || DEFAULT_TIMEOUT,
        }
      );
    }

    if (!approved) {
      throw new Error('User denied command execution');
    }

    // Log the command execution attempt
    this.daemon.logEvent(this.taskId, 'tool_call', {
      tool: 'run_command',
      command,
      cwd: options?.cwd || this.workspace.path,
    });

    const timeout = Math.min(options?.timeout || DEFAULT_TIMEOUT, MAX_TIMEOUT);

    // Create a minimal, safe environment (don't leak sensitive process.env vars like API keys)
    const safeEnv: Record<string, string> = {
      // Essential system variables only
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      HOME: process.env.HOME || '',
      USER: process.env.USER || '',
      SHELL: process.env.SHELL || '/bin/bash',
      LANG: process.env.LANG || 'en_US.UTF-8',
      TERM: process.env.TERM || 'xterm-256color',
      TMPDIR: process.env.TMPDIR || '/tmp',
      // Add any user-provided env vars (explicitly passed by caller)
      ...options?.env,
    };

    const cwd = options?.cwd || this.workspace.path;

    // Emit the command being executed
    this.daemon.logEvent(this.taskId, 'command_output', {
      command,
      cwd,
      type: 'start',
      output: `$ ${command}\n`,
    });

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      // Increment session ID to invalidate any pending escalation timeouts from previous commands
      this.processSessionId++;
      // Clear any leftover escalation timeouts from previous commands
      this.clearEscalationTimeouts();

      // Use shell to handle complex commands with pipes, redirects, etc.
      const shell = process.env.SHELL || '/bin/bash';
      const child = spawn(shell, ['-c', command], {
        cwd,
        env: safeEnv,
        stdio: ['pipe', 'pipe', 'pipe'],  // Enable stdin for interactive commands
      });

      // Store reference to active process for stdin support
      this.activeProcess = child;

      // Set timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        this.daemon.logEvent(this.taskId, 'command_output', {
          command,
          type: 'error',
          output: `\n[Command timed out after ${timeout / 1000}s]\n`,
        });
      }, timeout);

      // Stream stdout
      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8');
        stdout += chunk;
        // Emit live output
        this.daemon.logEvent(this.taskId, 'command_output', {
          command,
          type: 'stdout',
          output: chunk,
        });
      });

      // Stream stderr
      child.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8');
        stderr += chunk;
        // Emit live output
        this.daemon.logEvent(this.taskId, 'command_output', {
          command,
          type: 'stderr',
          output: chunk,
        });
      });

      child.on('close', (code: number | null) => {
        clearTimeout(timeoutId);
        this.activeProcess = null;  // Clear active process reference
        // Clear any pending escalation timeouts to prevent killing reused PIDs
        this.clearEscalationTimeouts();

        // Determine termination reason to signal the agent
        let terminationReason: CommandTerminationReason = 'normal';
        if (this.userKillRequested) {
          terminationReason = 'user_stopped';
        } else if (killed) {
          terminationReason = 'timeout';
        }

        // Reset for next command
        this.userKillRequested = false;

        const success = code === 0 && terminationReason === 'normal';
        const truncatedStdout = this.truncateOutput(stdout);
        const truncatedStderr = this.truncateOutput(stderr);

        // Emit command completion with termination reason
        this.daemon.logEvent(this.taskId, 'command_output', {
          command,
          type: 'end',
          exitCode: code,
          success,
          terminationReason,
        });

        this.daemon.logEvent(this.taskId, 'tool_result', {
          tool: 'run_command',
          success,
          exitCode: code,
          terminationReason,
          error: terminationReason === 'timeout' ? 'Command timed out' :
                 terminationReason === 'user_stopped' ? 'Command stopped by user' : undefined,
        });

        resolve({
          success,
          stdout: truncatedStdout,
          stderr: truncatedStderr,
          exitCode: code,
          truncated: stdout.length > MAX_OUTPUT_SIZE || stderr.length > MAX_OUTPUT_SIZE,
          terminationReason,
        });
      });

      child.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        this.activeProcess = null;  // Clear active process reference
        // Clear any pending escalation timeouts to prevent killing reused PIDs
        this.clearEscalationTimeouts();
        // Reset user kill flag
        this.userKillRequested = false;

        const terminationReason: CommandTerminationReason = 'error';

        this.daemon.logEvent(this.taskId, 'command_output', {
          command,
          type: 'error',
          output: `\n[Error: ${error.message}]\n`,
          terminationReason,
        });

        this.daemon.logEvent(this.taskId, 'tool_result', {
          tool: 'run_command',
          success: false,
          error: error.message,
          terminationReason,
        });

        resolve({
          success: false,
          stdout: this.truncateOutput(stdout),
          stderr: error.message,
          exitCode: null,
          terminationReason,
        });
      });
    });
  }

  /**
   * Truncate output to prevent context overflow
   */
  private truncateOutput(output: string): string {
    if (output.length <= MAX_OUTPUT_SIZE) {
      return output;
    }
    return (
      output.slice(0, MAX_OUTPUT_SIZE) +
      `\n\n[... Output truncated. Showing first ${Math.round(MAX_OUTPUT_SIZE / 1024)}KB ...]`
    );
  }
}

// Export validation functions for testing
export const _testUtils = {
  isValidPid,
  isValidUsername,
  isProcessOwnedByCurrentUser,
  getDescendantPids,
  killProcessTree,
};
