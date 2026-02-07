import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task, TaskEvent, Workspace } from '../../../../shared/types';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp'),
  },
}));

vi.mock('../../../mcp/client/MCPClientManager', () => ({
  MCPClientManager: {
    getInstance: vi.fn().mockImplementation(() => {
      throw new Error('MCP not initialized');
    }),
  },
}));

vi.mock('../../../mcp/settings', () => ({
  MCPSettingsManager: {
    loadSettings: vi.fn().mockReturnValue({ toolNamePrefix: 'mcp_' }),
  },
}));

vi.mock('../../../settings/personality-manager', () => ({
  PersonalityManager: {
    loadSettings: vi.fn().mockReturnValue({}),
    saveSettings: vi.fn(),
    setUserName: vi.fn(),
    getUserName: vi.fn(),
    getAgentName: vi.fn().mockReturnValue('CoWork'),
    setActivePersona: vi.fn(),
    setResponseStyle: vi.fn(),
    setQuirks: vi.fn(),
    clearCache: vi.fn(),
  },
}));

vi.mock('../../custom-skill-loader', () => ({
  getCustomSkillLoader: vi.fn().mockReturnValue({
    getSkill: vi.fn(),
    listModelInvocableSkills: vi.fn().mockReturnValue([]),
    expandPrompt: vi.fn().mockReturnValue(''),
    getSkillDescriptionsForModel: vi.fn().mockReturnValue(''),
  }),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue('{}'),
    readdirSync: vi.fn().mockReturnValue([]),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue('{}'),
  readdirSync: vi.fn().mockReturnValue([]),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    writeFile: vi.fn(),
  },
  writeFile: vi.fn(),
}));

// Mock MentionTools to avoid DatabaseManager dependency
vi.mock('../mention-tools', () => {
  return {
    MentionTools: class MockMentionTools {
      getTools() {
        return [];
      }
      static getToolDefinitions() {
        return [];
      }
    },
  };
});

import { ToolRegistry } from '../registry';

describe('ToolRegistry child task control tools', () => {
  let workspace: Workspace;

  beforeEach(() => {
    workspace = {
      id: 'ws-1',
      name: 'Test Workspace',
      path: '/tmp',
      createdAt: Date.now(),
      permissions: { read: true, write: true, delete: true, network: true, shell: false },
    };
  });

  it('wait_for_agent rejects non-descendant tasks', async () => {
    const tasks = new Map<string, Task>([
      [
        'other-task',
        {
          id: 'other-task',
          title: 'Other',
          prompt: 'x',
          status: 'executing',
          workspaceId: workspace.id,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    ]);

    const daemon = {
      getTaskById: vi.fn().mockImplementation(async (id: string) => tasks.get(id)),
      logEvent: vi.fn(),
    } as any;

    const registry = new ToolRegistry(workspace, daemon, 'parent-task');
    const result = await registry.executeTool('wait_for_agent', { task_id: 'other-task', timeout_seconds: 1 });

    expect(result.success).toBe(false);
    expect(result.status).toBe('forbidden');
    expect(result.error).toBe('FORBIDDEN');
  });

  it('send_agent_message only allows descendant tasks', async () => {
    const tasks = new Map<string, Task>([
      [
        'child-task',
        {
          id: 'child-task',
          title: 'Child',
          prompt: 'x',
          status: 'executing',
          workspaceId: workspace.id,
          createdAt: 1,
          updatedAt: 1,
          parentTaskId: 'parent-task',
          agentType: 'sub',
          depth: 1,
        },
      ],
      [
        'other-task',
        {
          id: 'other-task',
          title: 'Other',
          prompt: 'x',
          status: 'executing',
          workspaceId: workspace.id,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    ]);

    const daemon = {
      getTaskById: vi.fn().mockImplementation(async (id: string) => tasks.get(id)),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      logEvent: vi.fn(),
    } as any;

    const registry = new ToolRegistry(workspace, daemon, 'parent-task');

    const forbidden = await registry.executeTool('send_agent_message', { task_id: 'other-task', message: 'hi' });
    expect(forbidden.success).toBe(false);
    expect(forbidden.error).toBe('FORBIDDEN');

    const ok = await registry.executeTool('send_agent_message', { task_id: 'child-task', message: 'hi' });
    expect(ok.success).toBe(true);
    expect(daemon.sendMessage).toHaveBeenCalledWith('child-task', 'hi');
  });

  it('capture_agent_events returns summarized events', async () => {
    const tasks = new Map<string, Task>([
      [
        'child-task',
        {
          id: 'child-task',
          title: 'Child',
          prompt: 'x',
          status: 'executing',
          workspaceId: workspace.id,
          createdAt: 1,
          updatedAt: 1,
          parentTaskId: 'parent-task',
          agentType: 'sub',
          depth: 1,
        },
      ],
    ]);

    const childEvents: TaskEvent[] = [
      { id: 'e1', taskId: 'child-task', timestamp: 1, type: 'assistant_message', payload: { content: 'hello' } },
      { id: 'e2', taskId: 'child-task', timestamp: 2, type: 'file_created', payload: { path: 'out.txt' } },
    ];

    const daemon = {
      getTaskById: vi.fn().mockImplementation(async (id: string) => tasks.get(id)),
      getTaskEvents: vi.fn().mockReturnValue(childEvents),
      logEvent: vi.fn(),
    } as any;

    const registry = new ToolRegistry(workspace, daemon, 'parent-task');
    const result = await registry.executeTool('capture_agent_events', { task_id: 'child-task', limit: 10 });

    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toEqual({ timestamp: 1, type: 'assistant_message', summary: 'hello' });
    expect(result.events[1].type).toBe('file_created');
  });
});
