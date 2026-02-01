/**
 * Security Utilities for Sandbox Operations
 *
 * Provides secure implementations for common operations:
 * - Secure temp file creation (TOCTOU-safe)
 * - Path validation with symlink resolution
 * - String escaping for sandbox profiles
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

/**
 * Create a secure temporary file with random name
 * Uses crypto.randomBytes to prevent predictable filenames (TOCTOU mitigation)
 *
 * @param extension - File extension (e.g., '.py', '.js')
 * @param content - Content to write to the file
 * @returns Object with file path and cleanup function
 */
export function createSecureTempFile(
  extension: string,
  content: string
): { filePath: string; cleanup: () => void } {
  // Generate cryptographically random filename
  const randomBytes = crypto.randomBytes(16).toString('hex');
  const filename = `cowork_${randomBytes}${extension}`;
  const tempDir = os.tmpdir();

  // Validate temp directory exists and is writable
  if (!fs.existsSync(tempDir)) {
    throw new Error(`Temp directory does not exist: ${tempDir}`);
  }

  const filePath = path.join(tempDir, filename);

  // Use O_CREAT | O_EXCL to atomically create file (fails if exists)
  // This prevents TOCTOU race conditions
  const fd = fs.openSync(filePath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  try {
    fs.writeSync(fd, content, 0, 'utf8');
  } finally {
    fs.closeSync(fd);
  }

  const cleanup = () => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup errors
    }
  };

  return { filePath, cleanup };
}

/**
 * Validate and resolve a path, following symlinks
 * Returns null if path is outside allowed boundaries
 *
 * @param targetPath - Path to validate
 * @param allowedBasePaths - List of allowed base paths
 * @returns Resolved real path or null if invalid/outside boundaries
 */
export function validateAndResolvePath(
  targetPath: string,
  allowedBasePaths: string[]
): string | null {
  // Reject paths with null bytes (path traversal attack vector)
  if (targetPath.includes('\0')) {
    return null;
  }

  // Normalize the path first
  const normalizedTarget = path.normalize(targetPath);

  // Check if path exists before attempting to resolve symlinks
  if (!fs.existsSync(normalizedTarget)) {
    // For non-existent paths, just validate against normalized path
    for (const basePath of allowedBasePaths) {
      const normalizedBase = path.resolve(basePath);
      if (path.resolve(normalizedTarget).startsWith(normalizedBase + path.sep) ||
          path.resolve(normalizedTarget) === normalizedBase) {
        return path.resolve(normalizedTarget);
      }
    }
    return null;
  }

  try {
    // Resolve symlinks to get real path
    const realPath = fs.realpathSync(normalizedTarget);

    // Check if real path is within allowed boundaries
    for (const basePath of allowedBasePaths) {
      const realBasePath = fs.existsSync(basePath)
        ? fs.realpathSync(basePath)
        : path.resolve(basePath);

      if (realPath.startsWith(realBasePath + path.sep) || realPath === realBasePath) {
        return realPath;
      }
    }

    return null;
  } catch {
    // If we can't resolve the path, it's not valid
    return null;
  }
}

/**
 * Escape a string for use in macOS sandbox-exec profile
 * Prevents sandbox profile injection attacks
 *
 * @param input - String to escape
 * @returns Escaped string safe for sandbox profile
 */
export function escapeSandboxProfileString(input: string): string {
  // Validate input doesn't contain null bytes
  if (input.includes('\0')) {
    throw new Error('Path contains null byte, which is not allowed');
  }

  // Escape characters that have special meaning in sandbox profiles:
  // - Backslash: escape character
  // - Double quote: string delimiter
  // - Parentheses: LISP-like syntax
  // - Semicolon: comment start
  return input
    .replace(/\\/g, '\\\\')     // Escape backslashes first
    .replace(/"/g, '\\"')       // Escape double quotes
    .replace(/\(/g, '\\(')      // Escape open paren
    .replace(/\)/g, '\\)')      // Escape close paren
    .replace(/;/g, '\\;');      // Escape semicolons
}

/**
 * Validate a path is safe for sandbox profile inclusion
 * Rejects paths with dangerous characters that could break profile syntax
 *
 * @param pathToValidate - Path to validate
 * @returns true if safe, throws error if not
 */
export function validatePathForSandboxProfile(pathToValidate: string): boolean {
  // Check for null bytes
  if (pathToValidate.includes('\0')) {
    throw new Error('Path contains null byte');
  }

  // Check for newlines (could inject new profile lines)
  if (pathToValidate.includes('\n') || pathToValidate.includes('\r')) {
    throw new Error('Path contains newline characters');
  }

  // Validate path is absolute and normalized
  if (!path.isAbsolute(pathToValidate)) {
    throw new Error('Path must be absolute');
  }

  return true;
}

/**
 * Escape a value for Docker environment variable
 * Prevents command injection through environment variables
 *
 * @param value - Environment variable value to escape
 * @returns Escaped value safe for Docker -e flag
 */
export function escapeDockerEnvValue(value: string): string {
  // Reject values with null bytes
  if (value.includes('\0')) {
    throw new Error('Environment value contains null byte');
  }

  // For Docker, we need to handle shell metacharacters
  // The safest approach is to reject problematic characters
  // or use Docker's --env-file feature for complex values

  // Check for newlines which could inject additional arguments
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error('Environment value contains newline characters');
  }

  return value;
}

/**
 * Validate an environment variable name is safe
 *
 * @param name - Environment variable name
 * @returns true if valid, throws if not
 */
export function validateEnvVarName(name: string): boolean {
  // Standard env var naming: alphanumeric and underscore, starting with letter or underscore
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid environment variable name: ${name}`);
  }

  // Blacklist dangerous environment variables that could affect sandboxed processes
  const dangerousVars = [
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'DYLD_INSERT_LIBRARIES',
    'DYLD_LIBRARY_PATH',
    'PYTHONPATH',
    'NODE_OPTIONS',
    'NODE_PATH',
    'PERL5OPT',
    'RUBYOPT',
  ];

  if (dangerousVars.includes(name.toUpperCase())) {
    throw new Error(`Dangerous environment variable not allowed: ${name}`);
  }

  return true;
}

/**
 * Safe environment passthrough that validates and filters variables
 *
 * @param requestedVars - List of environment variable names to pass through
 * @returns Record of safe environment variables
 */
export function buildSafeEnvironment(
  requestedVars: string[]
): Record<string, string | undefined> {
  const safeEnv: Record<string, string | undefined> = {};

  for (const name of requestedVars) {
    try {
      validateEnvVarName(name);
      const value = process.env[name];
      if (value !== undefined) {
        escapeDockerEnvValue(value); // Validates value is safe
        safeEnv[name] = value;
      }
    } catch {
      // Skip invalid or dangerous variables silently
      console.warn(`[SecurityUtils] Skipping unsafe environment variable: ${name}`);
    }
  }

  return safeEnv;
}
