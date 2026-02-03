import * as path from 'path';
import * as fs from 'fs';
import { Workspace } from '../../../shared/types';
import { AgentDaemon } from '../daemon';
import { XSettingsManager } from '../../settings/x-manager';
import { runBirdCommand } from '../../utils/x-cli';

type XAction =
  | 'whoami'
  | 'read'
  | 'thread'
  | 'replies'
  | 'search'
  | 'user_tweets'
  | 'mentions'
  | 'home'
  | 'tweet'
  | 'reply'
  | 'follow'
  | 'unfollow';

interface XActionInput {
  action: XAction;
  id_or_url?: string;
  query?: string;
  user?: string;
  text?: string;
  timeline?: 'for_you' | 'following';
  count?: number;
  media?: string[];
  alt?: string;
}

const MAX_COUNT = 50;
const MAX_MEDIA = 4;

export class XTools {
  constructor(
    private workspace: Workspace,
    private daemon: AgentDaemon,
    private taskId: string
  ) {}

  setWorkspace(workspace: Workspace): void {
    this.workspace = workspace;
  }

  static isEnabled(): boolean {
    return XSettingsManager.loadSettings().enabled;
  }

  private normalizeHandle(handle?: string): string | undefined {
    if (!handle) return undefined;
    const trimmed = handle.trim();
    if (!trimmed) return undefined;
    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
  }

  private resolveMediaPaths(media?: string[]): string[] {
    if (!media || media.length === 0) return [];
    if (!this.workspace.permissions.read) {
      throw new Error('Read permission not granted for media uploads');
    }

    const normalized = media
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, MAX_MEDIA);

    const workspaceRoot = path.resolve(this.workspace.path);
    const allowedPaths = this.workspace.permissions.allowedPaths || [];
    const canReadOutside = this.workspace.isTemp || this.workspace.permissions.unrestrictedFileAccess;

    const isPathAllowed = (absolutePath: string): boolean => {
      if (allowedPaths.length === 0) return false;
      const normalizedPath = path.normalize(absolutePath);
      return allowedPaths.some((allowed) => {
        const normalizedAllowed = path.normalize(allowed);
        return normalizedPath === normalizedAllowed || normalizedPath.startsWith(normalizedAllowed + path.sep);
      });
    };

    const resolved = normalized.map((item) => {
      const candidate = path.isAbsolute(item)
        ? path.normalize(item)
        : path.resolve(workspaceRoot, item);

      const relative = path.relative(workspaceRoot, candidate);
      const isInsideWorkspace = !(relative.startsWith('..') || path.isAbsolute(relative));
      if (!isInsideWorkspace && !canReadOutside && !isPathAllowed(candidate)) {
        throw new Error('Media path must be inside the workspace or in Allowed Paths');
      }
      if (!fs.existsSync(candidate)) {
        throw new Error(`Media file not found: ${item}`);
      }
      const stats = fs.statSync(candidate);
      if (!stats.isFile()) {
        throw new Error(`Media path is not a file: ${item}`);
      }
      return candidate;
    });

    return resolved;
  }

  private async requireApproval(summary: string, details: Record<string, unknown>): Promise<void> {
    const approved = await this.daemon.requestApproval(
      this.taskId,
      'external_service',
      summary,
      details
    );

    if (!approved) {
      throw new Error('User denied X action');
    }
  }

  async executeAction(input: XActionInput): Promise<any> {
    const settings = XSettingsManager.loadSettings();
    if (!settings.enabled) {
      throw new Error('X integration is disabled. Enable it in Settings > More Channels > X.');
    }

    const action = input.action;
    if (!action) {
      throw new Error('Missing required "action" parameter');
    }

    const args: string[] = [];

    switch (action) {
      case 'whoami': {
        args.push('whoami');
        break;
      }
      case 'read': {
        if (!input.id_or_url) throw new Error('Missing id_or_url for read');
        args.push('read', input.id_or_url);
        break;
      }
      case 'thread': {
        if (!input.id_or_url) throw new Error('Missing id_or_url for thread');
        args.push('thread', input.id_or_url);
        break;
      }
      case 'replies': {
        if (!input.id_or_url) throw new Error('Missing id_or_url for replies');
        args.push('replies', input.id_or_url);
        break;
      }
      case 'search': {
        if (!input.query) throw new Error('Missing query for search');
        args.push('search', input.query);
        if (input.count) {
          const count = Math.min(Math.max(1, input.count), MAX_COUNT);
          args.push('-n', String(count));
        }
        break;
      }
      case 'user_tweets': {
        const handle = this.normalizeHandle(input.user);
        if (!handle) throw new Error('Missing user for user_tweets');
        args.push('user-tweets', handle);
        if (input.count) {
          const count = Math.min(Math.max(1, input.count), MAX_COUNT);
          args.push('-n', String(count));
        }
        break;
      }
      case 'mentions': {
        args.push('mentions');
        const handle = this.normalizeHandle(input.user);
        if (handle) {
          args.push('--user', handle);
        }
        if (input.count) {
          const count = Math.min(Math.max(1, input.count), MAX_COUNT);
          args.push('-n', String(count));
        }
        break;
      }
      case 'home': {
        args.push('home');
        if (input.timeline === 'following') {
          args.push('--following');
        }
        if (input.count) {
          const count = Math.min(Math.max(1, input.count), MAX_COUNT);
          args.push('-n', String(count));
        }
        break;
      }
      case 'tweet': {
        if (!input.text) throw new Error('Missing text for tweet');
        const mediaPaths = this.resolveMediaPaths(input.media);
        const preview = input.text.length > 120 ? `${input.text.slice(0, 117)}...` : input.text;
        await this.requireApproval(`Post to X: "${preview}"`, {
          action: 'tweet',
          text: input.text,
          mediaCount: mediaPaths.length,
        });
        args.push('tweet', input.text);
        for (const mediaPath of mediaPaths) {
          args.push('--media', mediaPath);
        }
        if (input.alt) {
          args.push('--alt', input.alt);
        }
        break;
      }
      case 'reply': {
        if (!input.id_or_url) throw new Error('Missing id_or_url for reply');
        if (!input.text) throw new Error('Missing text for reply');
        const mediaPaths = this.resolveMediaPaths(input.media);
        const preview = input.text.length > 120 ? `${input.text.slice(0, 117)}...` : input.text;
        await this.requireApproval(`Reply on X: "${preview}"`, {
          action: 'reply',
          inReplyTo: input.id_or_url,
          text: input.text,
          mediaCount: mediaPaths.length,
        });
        args.push('reply', input.id_or_url, input.text);
        for (const mediaPath of mediaPaths) {
          args.push('--media', mediaPath);
        }
        if (input.alt) {
          args.push('--alt', input.alt);
        }
        break;
      }
      case 'follow': {
        const handle = this.normalizeHandle(input.user);
        if (!handle) throw new Error('Missing user for follow');
        await this.requireApproval(`Follow ${handle} on X`, { action: 'follow', user: handle });
        args.push('follow', handle);
        break;
      }
      case 'unfollow': {
        const handle = this.normalizeHandle(input.user);
        if (!handle) throw new Error('Missing user for unfollow');
        await this.requireApproval(`Unfollow ${handle} on X`, { action: 'unfollow', user: handle });
        args.push('unfollow', handle);
        break;
      }
      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    const result = await runBirdCommand(settings, args, { json: true });

    this.daemon.logEvent(this.taskId, 'tool_result', {
      tool: 'x_action',
      action,
      hasData: !!result.data,
      stderr: result.stderr ? true : false,
    });

    return {
      success: true,
      action,
      output: result.stdout,
      data: result.data,
      stderr: result.stderr || undefined,
    };
  }
}
