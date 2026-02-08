import { buildTaskExportJson, extractFileChanges, extractLatestUsage } from '../task-export';
import type { Task, TaskEvent, Workspace } from '../../../shared/types';

describe('task-export', () => {
  it('extractFileChanges() dedupes and sorts paths by category', () => {
    const events: TaskEvent[] = [
      { id: 'e1', taskId: 't1', timestamp: 1, type: 'file_created', payload: { path: 'b.txt' } },
      { id: 'e2', taskId: 't1', timestamp: 2, type: 'file_created', payload: { path: 'a.txt' } },
      { id: 'e3', taskId: 't1', timestamp: 3, type: 'file_created', payload: { path: 'a.txt' } },
      { id: 'e4', taskId: 't1', timestamp: 4, type: 'file_modified', payload: { path: 'z.txt' } },
      { id: 'e5', taskId: 't1', timestamp: 5, type: 'file_deleted', payload: { path: 'y.txt' } },
    ];

    expect(extractFileChanges(events)).toEqual({
      created: ['a.txt', 'b.txt'],
      modified: ['z.txt'],
      deleted: ['y.txt'],
    });
  });

  it('extractLatestUsage() returns totals from the most recent usage event', () => {
    const events: TaskEvent[] = [
      {
        id: 'e1',
        taskId: 't1',
        timestamp: 1000,
        type: 'llm_usage',
        payload: { totals: { inputTokens: 10, outputTokens: 5, cost: 0.01 }, modelId: 'm1', modelKey: 'k1' },
      },
      {
        id: 'e2',
        taskId: 't1',
        timestamp: 2000,
        type: 'llm_usage',
        payload: { totals: { inputTokens: 20, outputTokens: 9, cost: 0.02 }, modelId: 'm2', modelKey: 'k2' },
      },
    ];

    expect(extractLatestUsage(events)).toEqual({
      inputTokens: 20,
      outputTokens: 9,
      totalTokens: 29,
      cost: 0.02,
      modelId: 'm2',
      modelKey: 'k2',
      updatedAt: 2000,
    });
  });

  it('buildTaskExportJson() builds a stable, prompt-free summary structure', () => {
    const workspaces: Workspace[] = [
      {
        id: 'ws1',
        name: 'Workspace One',
        path: '/tmp/ws1',
        createdAt: 1,
        permissions: { read: true, write: true, delete: false, network: true, shell: false },
      },
    ];

    const tasks: Task[] = [
      {
        id: 't1',
        title: 'Task One',
        prompt: 'secret prompt content',
        status: 'completed',
        workspaceId: 'ws1',
        createdAt: 1000,
        updatedAt: 2000,
        completedAt: 5000,
        resultSummary: 'done',
      },
      {
        id: 't2',
        title: 'Task Two',
        prompt: 'another prompt',
        status: 'executing',
        workspaceId: 'ws1',
        createdAt: 3000,
        updatedAt: 3500,
      },
    ];

    const events: TaskEvent[] = [
      { id: 'e1', taskId: 't1', timestamp: 1500, type: 'file_created', payload: { path: 'out.txt' } },
      { id: 'e2', taskId: 't1', timestamp: 1600, type: 'llm_usage', payload: { totals: { inputTokens: 3, outputTokens: 4, cost: 0.001 } } },
    ];

    const exportedAt = 6000;
    const result = buildTaskExportJson({
      query: { workspaceId: 'ws1', limit: 2, offset: 0 },
      tasks,
      workspaces,
      events,
      exportedAt,
    });

    expect(result.schemaVersion).toBe(1);
    expect(result.exportedAt).toBe(exportedAt);
    expect(result.tasks).toEqual([
      {
        taskId: 't1',
        title: 'Task One',
        status: 'completed',
        workspaceId: 'ws1',
        workspaceName: 'Workspace One',
        createdAt: 1000,
        updatedAt: 2000,
        completedAt: 5000,
        durationMs: 4000,
        usage: {
          inputTokens: 3,
          outputTokens: 4,
          totalTokens: 7,
          cost: 0.001,
          updatedAt: 1600,
        },
        files: {
          created: ['out.txt'],
          modified: [],
          deleted: [],
        },
        resultSummary: 'done',
      },
      {
        taskId: 't2',
        title: 'Task Two',
        status: 'executing',
        workspaceId: 'ws1',
        workspaceName: 'Workspace One',
        createdAt: 3000,
        updatedAt: 3500,
        durationMs: 3000,
      },
    ]);
  });
});

