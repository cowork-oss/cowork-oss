import * as fs from 'fs/promises';
import * as path from 'path';

type ProjectAccessConfig = {
  allow: Set<string>;
  deny: Set<string>;
};

export type ProjectAccessCheckResult = {
  allowed: boolean;
  reason?: string;
};

export function getWorkspaceRelativePosixPath(workspacePath: string, absolutePath: string): string | null {
  try {
    const root = path.resolve(workspacePath);
    const abs = path.resolve(absolutePath);
    const rel = path.relative(root, abs);
    if (!rel || rel === '.') return '';
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return rel.split(path.sep).join('/');
  } catch {
    return null;
  }
}

export function getProjectIdFromWorkspaceRelPath(relPosixPath: string): string | null {
  const prefix = '.cowork/projects/';
  if (!relPosixPath.startsWith(prefix)) return null;
  const rest = relPosixPath.slice(prefix.length);
  const projectId = rest.split('/')[0];
  return projectId || null;
}

function parseAccessMarkdown(markdown: string): ProjectAccessConfig {
  const allow = new Set<string>();
  const deny = new Set<string>();

  let section: 'allow' | 'deny' | null = null;
  const lines = (markdown || '').split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^##\s+(.+)\s*$/);
    if (heading) {
      const h = heading[1].trim().toLowerCase();
      if (h === 'allow' || h === 'allowed') section = 'allow';
      else if (h === 'deny' || h === 'denied') section = 'deny';
      else section = null;
      continue;
    }

    if (!section) continue;

    const bullet = line.match(/^-+\s+(.+)$/);
    if (!bullet) continue;

    let token = bullet[1].trim();
    if (!token) continue;

    token = token.replace(/^role\s*:\s*/i, '').trim();
    if (!token) continue;

    const normalized = token.toLowerCase() === 'all' ? '*' : token;
    if (section === 'allow') allow.add(normalized);
    if (section === 'deny') deny.add(normalized);
  }

  return { allow, deny };
}

export function checkProjectAccessFromMarkdown(params: {
  markdown: string;
  agentRoleId: string | null;
}): ProjectAccessCheckResult {
  const { markdown, agentRoleId } = params;

  // No agent role assignment -> treat as allowed (user-owned tasks).
  if (!agentRoleId) return { allowed: true };

  const { allow, deny } = parseAccessMarkdown(markdown);

  if (deny.has('*') || deny.has(agentRoleId)) {
    return { allowed: false, reason: 'Denied by ACCESS.md' };
  }

  // Allowlist is only enforced when it has at least one entry.
  if (allow.size > 0 && !allow.has('*') && !allow.has(agentRoleId)) {
    return { allowed: false, reason: 'Not allowed by ACCESS.md' };
  }

  return { allowed: true };
}

export async function checkProjectAccess(params: {
  workspacePath: string;
  projectId: string;
  agentRoleId: string | null;
}): Promise<ProjectAccessCheckResult> {
  const { workspacePath, projectId, agentRoleId } = params;

  const accessPath = path.join(workspacePath, '.cowork', 'projects', projectId, 'ACCESS.md');
  let markdown = '';
  try {
    markdown = await fs.readFile(accessPath, 'utf8');
  } catch {
    // No ACCESS.md -> allow by default.
    return { allowed: true };
  }

  const res = checkProjectAccessFromMarkdown({ markdown, agentRoleId });
  if (res.allowed) return res;
  return {
    allowed: false,
    reason: `${res.reason || 'Access denied'} (.cowork/projects/${projectId}/ACCESS.md)`,
  };
}
