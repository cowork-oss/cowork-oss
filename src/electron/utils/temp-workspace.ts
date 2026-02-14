import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { TEMP_WORKSPACE_ID, TEMP_WORKSPACE_ID_PREFIX } from '../../shared/types';

export interface TempWorkspacePruneOptions {
  db: Database.Database;
  tempWorkspaceRoot: string;
  currentWorkspaceId?: string;
  nowMs?: number;
  keepRecent?: number;
  maxAgeMs?: number;
  hardLimit?: number;
  targetAfterPrune?: number;
}

interface TempWorkspaceRow {
  id: string;
  path: string;
  last_used_at: number;
  created_at: number;
}

interface TempDirectoryEntry {
  path: string;
  mtimeMs: number;
}

const DEFAULT_KEEP_RECENT = 40;
const DEFAULT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const DEFAULT_HARD_LIMIT = 200;
const DEFAULT_TARGET_AFTER_PRUNE = 120;
const TEMP_ID_PREFIX_LENGTH = TEMP_WORKSPACE_ID_PREFIX.length;

const isSafeTempSubPath = (candidatePath: string, rootPath: string): boolean => {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedCandidate = path.resolve(candidatePath);
  if (resolvedCandidate === resolvedRoot) return false;
  return resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
};

const hasWorkspaceReferences = (db: Database.Database, workspaceId: string): boolean => {
  const taskRef = db.prepare('SELECT 1 FROM tasks WHERE workspace_id = ? LIMIT 1').get(workspaceId);
  if (taskRef) return true;
  const sessionRef = db.prepare('SELECT 1 FROM channel_sessions WHERE workspace_id = ? LIMIT 1').get(workspaceId);
  return !!sessionRef;
};

const listTempDirectories = (rootPath: string): TempDirectoryEntry[] => {
  if (!fs.existsSync(rootPath)) return [];
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  const dirs: TempDirectoryEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.resolve(path.join(rootPath, entry.name));
    if (!isSafeTempSubPath(fullPath, rootPath)) continue;
    try {
      const stat = fs.statSync(fullPath);
      dirs.push({ path: fullPath, mtimeMs: Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : stat.ctimeMs });
    } catch {
      // Ignore unreadable entries.
    }
  }

  return dirs;
};

export function pruneTempWorkspaces(options: TempWorkspacePruneOptions): { removedDirs: number; removedRows: number } {
  const nowMs = options.nowMs ?? Date.now();
  const keepRecent = Math.max(0, options.keepRecent ?? DEFAULT_KEEP_RECENT);
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const hardLimit = Math.max(1, options.hardLimit ?? DEFAULT_HARD_LIMIT);
  const targetAfterPrune = Math.max(0, Math.min(hardLimit, options.targetAfterPrune ?? DEFAULT_TARGET_AFTER_PRUNE));

  const resolvedRoot = path.resolve(options.tempWorkspaceRoot);

  const rows = options.db.prepare(`
    SELECT id, path, created_at, COALESCE(last_used_at, created_at) AS last_used_at
    FROM workspaces
    WHERE id = ? OR substr(id, 1, ?) = ?
    ORDER BY COALESCE(last_used_at, created_at) DESC
  `).all(TEMP_WORKSPACE_ID, TEMP_ID_PREFIX_LENGTH, TEMP_WORKSPACE_ID_PREFIX) as TempWorkspaceRow[];

  const taskRefRows = options.db.prepare(`
    SELECT DISTINCT workspace_id
    FROM tasks
    WHERE workspace_id = ? OR substr(workspace_id, 1, ?) = ?
  `).all(TEMP_WORKSPACE_ID, TEMP_ID_PREFIX_LENGTH, TEMP_WORKSPACE_ID_PREFIX) as Array<{ workspace_id: string | null }>;
  const taskReferencedWorkspaceIds = new Set(
    taskRefRows
      .map((row) => (typeof row.workspace_id === 'string' ? row.workspace_id : ''))
      .filter(Boolean)
  );

  const sessionRefRows = options.db.prepare(`
    SELECT DISTINCT workspace_id
    FROM channel_sessions
    WHERE workspace_id = ? OR substr(workspace_id, 1, ?) = ?
  `).all(TEMP_WORKSPACE_ID, TEMP_ID_PREFIX_LENGTH, TEMP_WORKSPACE_ID_PREFIX) as Array<{ workspace_id: string | null }>;
  const sessionReferencedWorkspaceIds = new Set(
    sessionRefRows
      .map((row) => (typeof row.workspace_id === 'string' ? row.workspace_id : ''))
      .filter(Boolean)
  );

  const protectedWorkspaceIds = new Set<string>();
  if (options.currentWorkspaceId) {
    protectedWorkspaceIds.add(options.currentWorkspaceId);
  }
  for (const workspaceId of taskReferencedWorkspaceIds) {
    protectedWorkspaceIds.add(workspaceId);
  }
  for (const workspaceId of sessionReferencedWorkspaceIds) {
    protectedWorkspaceIds.add(workspaceId);
  }

  const protectedIds = new Set<string>();
  for (let i = 0; i < rows.length && i < keepRecent; i += 1) {
    protectedIds.add(rows[i].id);
  }
  for (const workspaceId of protectedWorkspaceIds) {
    protectedIds.add(workspaceId);
  }

  const removableRows = rows.filter((row) => !protectedIds.has(row.id));
  const toDeleteIds = new Set<string>();

  for (const row of removableRows) {
    const ageMs = nowMs - Number(row.last_used_at || row.created_at || nowMs);
    if (ageMs > maxAgeMs) {
      toDeleteIds.add(row.id);
    }
  }

  let remainingCount = rows.length - toDeleteIds.size;
  if (remainingCount > hardLimit) {
    for (let i = removableRows.length - 1; i >= 0 && remainingCount > targetAfterPrune; i -= 1) {
      const id = removableRows[i].id;
      if (toDeleteIds.has(id)) continue;
      toDeleteIds.add(id);
      remainingCount -= 1;
    }
  }

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  let removedDirs = 0;
  let removedRows = 0;

  for (const workspaceId of toDeleteIds) {
    const row = rowsById.get(workspaceId);
    if (!row) continue;

    if (hasWorkspaceReferences(options.db, workspaceId)) {
      continue;
    }

    try {
      if (row.path && isSafeTempSubPath(row.path, resolvedRoot) && fs.existsSync(row.path)) {
        fs.rmSync(row.path, { recursive: true, force: true });
        removedDirs += 1;
      }
    } catch {
      // Best-effort cleanup; keep going.
    }

    try {
      options.db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId);
      removedRows += 1;
    } catch {
      // Best-effort DB cleanup; keep going.
    }
  }

  const rowsAfterDbPrune = options.db.prepare(`
    SELECT id, path, created_at, COALESCE(last_used_at, created_at) AS last_used_at
    FROM workspaces
    WHERE id = ? OR substr(id, 1, ?) = ?
    ORDER BY COALESCE(last_used_at, created_at) DESC
  `).all(TEMP_WORKSPACE_ID, TEMP_ID_PREFIX_LENGTH, TEMP_WORKSPACE_ID_PREFIX) as TempWorkspaceRow[];

  const protectedPaths = new Set<string>();
  const workspaceIdsByPath = new Map<string, string[]>();
  for (const row of rowsAfterDbPrune) {
    const resolvedPath = path.resolve(row.path);
    if (!isSafeTempSubPath(resolvedPath, resolvedRoot)) continue;
    protectedPaths.add(resolvedPath);
    const existing = workspaceIdsByPath.get(resolvedPath) ?? [];
    existing.push(row.id);
    workspaceIdsByPath.set(resolvedPath, existing);
  }

  const deleteDirectoryAndStaleRows = (directoryPath: string): boolean => {
    if (!isSafeTempSubPath(directoryPath, resolvedRoot)) return false;
    if (!fs.existsSync(directoryPath)) return false;

    try {
      fs.rmSync(directoryPath, { recursive: true, force: true });
      removedDirs += 1;
    } catch {
      return false;
    }

    const workspaceIds = workspaceIdsByPath.get(directoryPath) ?? [];
    for (const workspaceId of workspaceIds) {
      if (hasWorkspaceReferences(options.db, workspaceId)) {
        continue;
      }
      try {
        options.db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId);
        removedRows += 1;
      } catch {
        // Best-effort DB cleanup.
      }
    }
    return true;
  };

  // Filesystem-level cleanup pass:
  // 1) remove stale orphan dirs by age
  // 2) enforce hard folder cap even when DB rows don't reflect all on-disk dirs
  const directories = listTempDirectories(resolvedRoot);
  const orphanDirectories = directories.filter((entry) => !protectedPaths.has(entry.path));

  for (const entry of orphanDirectories) {
    const ageMs = nowMs - entry.mtimeMs;
    if (ageMs > maxAgeMs) {
      deleteDirectoryAndStaleRows(entry.path);
    }
  }

  const directoriesAfterAgePrune = listTempDirectories(resolvedRoot);
  let remainingDirCount = directoriesAfterAgePrune.length;
  if (remainingDirCount > hardLimit) {
    const candidateDirs = directoriesAfterAgePrune
      .filter((entry) => !protectedPaths.has(entry.path))
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

    for (const entry of candidateDirs) {
      if (remainingDirCount <= targetAfterPrune) break;
      if (deleteDirectoryAndStaleRows(entry.path)) {
        remainingDirCount -= 1;
      }
    }
  }

  return { removedDirs, removedRows };
}
