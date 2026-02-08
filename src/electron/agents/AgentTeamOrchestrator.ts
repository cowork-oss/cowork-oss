import { BrowserWindow } from 'electron';
import type { AgentConfig, Task, AgentTeam, AgentTeamItem, AgentTeamRun, AgentTeamRunStatus, AgentTeamItemStatus, UpdateAgentTeamItemRequest } from '../../shared/types';
import { IPC_CHANNELS } from '../../shared/types';
import { resolveModelPreferenceToModelKey, resolvePersonalityPreference } from '../../shared/agent-preferences';
import { AgentTeamRepository } from './AgentTeamRepository';
import { AgentTeamRunRepository } from './AgentTeamRunRepository';
import { AgentTeamItemRepository } from './AgentTeamItemRepository';

type AgentTeamRepositoryLike = Pick<AgentTeamRepository, 'findById'> | { findById: (id: string) => AgentTeam | undefined };
type AgentTeamRunRepositoryLike =
  Pick<AgentTeamRunRepository, 'findById' | 'update'>
  | { findById: (id: string) => AgentTeamRun | undefined; update: (id: string, updates: { status?: AgentTeamRunStatus; completedAt?: number | null; error?: string | null; summary?: string | null }) => AgentTeamRun | undefined };
type AgentTeamItemRepositoryLike =
  Pick<AgentTeamItemRepository, 'listByRun' | 'listBySourceTaskId' | 'update'>
  | {
    listByRun: (teamRunId: string) => AgentTeamItem[];
    listBySourceTaskId: (sourceTaskId: string) => AgentTeamItem[];
    update: (request: UpdateAgentTeamItemRequest) => AgentTeamItem | undefined;
  };

export type AgentTeamOrchestratorDeps = {
  getDatabase: () => import('better-sqlite3').Database;
  getTaskById: (taskId: string) => Promise<Task | undefined>;
  createChildTask: (params: {
    title: string;
    prompt: string;
    workspaceId: string;
    parentTaskId: string;
    agentType: 'sub' | 'parallel';
    agentConfig?: AgentConfig;
    depth?: number;
    assignedAgentRoleId?: string;
  }) => Promise<Task>;
  cancelTask: (taskId: string) => Promise<void>;
};

function emitTeamEvent(event: any): void {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((window) => {
    try {
      if (!window.isDestroyed() && window.webContents && !window.webContents.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.TEAM_RUN_EVENT, event);
      }
    } catch {
      // ignore
    }
  });
}

function isTerminalItemStatus(status: AgentTeamItemStatus): boolean {
  return status === 'done' || status === 'failed' || status === 'blocked';
}

function isTerminalTaskStatus(status: Task['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export class AgentTeamOrchestrator {
  private teamRepo: AgentTeamRepositoryLike;
  private runRepo: AgentTeamRunRepositoryLike;
  private itemRepo: AgentTeamItemRepositoryLike;
  private runLocks = new Map<string, boolean>();

  constructor(
    private deps: AgentTeamOrchestratorDeps,
    repos?: { teamRepo?: AgentTeamRepositoryLike; runRepo?: AgentTeamRunRepositoryLike; itemRepo?: AgentTeamItemRepositoryLike }
  ) {
    if (repos?.teamRepo && repos?.runRepo && repos?.itemRepo) {
      this.teamRepo = repos.teamRepo;
      this.runRepo = repos.runRepo;
      this.itemRepo = repos.itemRepo;
      return;
    }

    const db = deps.getDatabase();
    this.teamRepo = new AgentTeamRepository(db);
    this.runRepo = new AgentTeamRunRepository(db);
    this.itemRepo = new AgentTeamItemRepository(db);
  }

  async tickRun(runId: string, reason: string = 'tick'): Promise<void> {
    if (this.runLocks.get(runId)) return;
    this.runLocks.set(runId, true);
    try {
      const run = this.runRepo.findById(runId);
      if (!run) return;
      if (run.status !== 'running') return;

      const team = this.teamRepo.findById(run.teamId);
      if (!team) return;

      const rootTask = await this.deps.getTaskById(run.rootTaskId);
      if (!rootTask) {
        const updated = this.runRepo.update(run.id, {
          status: 'failed',
          error: `Root task not found: ${run.rootTaskId}`,
        });
        if (updated) {
          emitTeamEvent({ type: 'team_run_updated', timestamp: Date.now(), run: updated, reason });
        }
        return;
      }

      const items = this.itemRepo.listByRun(run.id);

      // Reconcile any in-progress items whose tasks are already terminal.
      for (const item of items) {
        if (item.status !== 'in_progress') continue;
        if (!item.sourceTaskId) continue;
        const task = await this.deps.getTaskById(item.sourceTaskId);
        if (!task) continue;
        if (!isTerminalTaskStatus(task.status)) continue;
        await this.onTaskTerminal(item.sourceTaskId);
      }

      const refreshedItems = this.itemRepo.listByRun(run.id);
      const inProgress = refreshedItems.filter((i) => i.status === 'in_progress');

      // If everything is terminal, complete the run.
      const nonTerminal = refreshedItems.filter((i) => !isTerminalItemStatus(i.status));
      if (nonTerminal.length === 0) {
        const hasFailures = refreshedItems.some((i) => i.status === 'failed');
        const status = hasFailures ? 'failed' : 'completed';
        const summary = this.buildRunSummary(refreshedItems);
        const updated = this.runRepo.update(run.id, { status, summary });
        if (updated) {
          emitTeamEvent({ type: 'team_run_updated', timestamp: Date.now(), run: updated, reason: 'all_items_terminal' });
        }
        return;
      }

      const maxParallel = Math.max(1, Number(team.maxParallelAgents || 1));
      const slots = Math.max(0, maxParallel - inProgress.length);
      if (slots <= 0) return;

      const candidates = refreshedItems
        .filter((i) => i.status === 'todo' && !i.sourceTaskId)
        .sort((a, b) => (a.sortOrder - b.sortOrder) || (a.createdAt - b.createdAt));

      const toSpawn = candidates.slice(0, slots);
      for (const item of toSpawn) {
        const childTitle = `Team: ${team.name} - ${item.title}`;
        const childPrompt = this.buildItemPrompt(team.name, rootTask, item.title, item.description);
        const assignedRoleId = item.ownerAgentRoleId || team.leadAgentRoleId;
        const depth = (typeof rootTask.depth === 'number' ? rootTask.depth : 0) + 1;

        const agentConfig: AgentConfig = {
          retainMemory: false,
          // Team runs are UI-driven orchestration; respect the global queue settings by default.
          bypassQueue: false,
        };
        const modelKey = resolveModelPreferenceToModelKey(team.defaultModelPreference);
        if (modelKey) agentConfig.modelKey = modelKey;
        const personalityId = resolvePersonalityPreference(team.defaultPersonality);
        if (personalityId) agentConfig.personalityId = personalityId;

        const child = await this.deps.createChildTask({
          title: childTitle,
          prompt: childPrompt,
          workspaceId: rootTask.workspaceId,
          parentTaskId: rootTask.id,
          agentType: 'sub',
          agentConfig,
          depth,
          assignedAgentRoleId: assignedRoleId,
        });

        const updatedItem = this.itemRepo.update({
          id: item.id,
          sourceTaskId: child.id,
          status: 'in_progress',
        });

        if (updatedItem) {
          emitTeamEvent({
            type: 'team_item_spawned',
            timestamp: Date.now(),
            runId: run.id,
            item: updatedItem,
            spawnedTaskId: child.id,
          });
        }
      }
    } catch (error: any) {
      emitTeamEvent({ type: 'team_run_event_error', timestamp: Date.now(), runId, error: error?.message || String(error) });
    } finally {
      this.runLocks.set(runId, false);
    }
  }

  async onTaskTerminal(taskId: string): Promise<void> {
    const items = this.itemRepo.listBySourceTaskId(taskId);
    if (items.length === 0) return;

    const task = await this.deps.getTaskById(taskId);
    if (!task) return;

    const nextStatus: AgentTeamItemStatus | null = (() => {
      if (task.status === 'completed') return 'done';
      if (task.status === 'failed') return 'failed';
      if (task.status === 'cancelled') return 'blocked';
      return null;
    })();

    if (!nextStatus) return;

    for (const item of items) {
      const resultSummary =
        (typeof task.resultSummary === 'string' && task.resultSummary.trim().length > 0)
          ? task.resultSummary.trim()
          : (typeof task.error === 'string' && task.error.trim().length > 0)
            ? `Error: ${task.error.trim()}`
            : null;

      const updated = this.itemRepo.update({
        id: item.id,
        status: nextStatus,
        resultSummary,
      });
      if (updated) {
        emitTeamEvent({
          type: 'team_item_updated',
          timestamp: Date.now(),
          teamRunId: updated.teamRunId,
          item: updated,
        });
        await this.tickRun(updated.teamRunId, 'task_terminal');
      }
    }
  }

  async cancelRun(runId: string): Promise<void> {
    const run = this.runRepo.findById(runId);
    if (!run) return;

    const updatedRun = this.runRepo.update(runId, { status: 'cancelled' });
    if (updatedRun) {
      emitTeamEvent({ type: 'team_run_updated', timestamp: Date.now(), run: updatedRun, reason: 'cancel' });
    }

    const items = this.itemRepo.listByRun(runId);
    for (const item of items) {
      if (item.status === 'in_progress' && item.sourceTaskId) {
        await this.deps.cancelTask(item.sourceTaskId).catch(() => {});
      }

      if (!isTerminalItemStatus(item.status)) {
        const updated = this.itemRepo.update({
          id: item.id,
          status: 'blocked',
          resultSummary: item.resultSummary || 'Cancelled by user',
        });
        if (updated) {
          emitTeamEvent({
            type: 'team_item_updated',
            timestamp: Date.now(),
            teamRunId: updated.teamRunId,
            item: updated,
          });
        }
      }
    }
  }

  private buildItemPrompt(teamName: string, rootTask: Task, itemTitle: string, itemDescription?: string): string {
    const parts: string[] = [];
    parts.push(`You are working as part of the team "${teamName}".`);
    parts.push('');
    parts.push('ROOT TASK CONTEXT:');
    parts.push(`- Title: ${rootTask.title}`);
    parts.push('Request:');
    parts.push(rootTask.prompt);
    parts.push('');
    parts.push('YOUR CHECKLIST ITEM:');
    parts.push(`- Title: ${itemTitle}`);
    if (itemDescription && itemDescription.trim().length > 0) {
      parts.push(`- Details: ${itemDescription.trim()}`);
    }
    parts.push('');
    parts.push('DELIVERABLES:');
    parts.push('- Provide a concise summary of what you did and what you found.');
    parts.push('- If you created or modified files, list the file paths.');
    parts.push('- Call out risks or open questions.');
    return parts.join('\n');
  }

  private buildRunSummary(items: Array<{ status: AgentTeamItemStatus; title: string }>): string {
    const done = items.filter((i) => i.status === 'done').length;
    const failed = items.filter((i) => i.status === 'failed').length;
    const blocked = items.filter((i) => i.status === 'blocked').length;
    const total = items.length;
    const lines = [
      `Items: ${done} done, ${failed} failed, ${blocked} blocked (total: ${total})`,
    ];
    return lines.join('\n');
  }
}
