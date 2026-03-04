import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentDaemon } from "../daemon";

describe("AgentDaemon.handleTransientTaskFailure recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("recovers a stale executing+transient task back to queued before retry start", async () => {
    const taskId = "task-retry-recover";
    let storedTask: Any = {
      id: taskId,
      status: "queued",
      error: "",
    };

    const daemonLike = {
      retryCounts: new Map<string, number>(),
      pendingRetries: new Map<string, ReturnType<typeof setTimeout>>(),
      activeTasks: new Map<string, Any>([[taskId, { executor: {} }]]),
      maxTaskRetries: 2,
      retryDelayMs: 30_000,
      taskRepo: {
        findById: vi.fn(() => storedTask),
        update: vi.fn((id: string, updates: Record<string, unknown>) => {
          if (id !== taskId) return;
          storedTask = { ...storedTask, ...updates };
        }),
      },
      queueManager: {
        onTaskFinished: vi.fn(),
        isRunning: vi.fn(() => false),
        isQueued: vi.fn(() => false),
      },
      logEvent: vi.fn(),
      startTask: vi.fn(async () => {}),
      isTransientRetryErrorMessage: (message: unknown) =>
        typeof message === "string" &&
        /^Transient provider error\.\s*Retry\s+\d+\/\d+\s+in\s+\d+s\./i.test(message.trim()),
    } as Any;

    const scheduled = AgentDaemon.prototype.handleTransientTaskFailure.call(
      daemonLike,
      taskId,
      "socket hang up",
      1000,
    );

    expect(scheduled).toBe(true);
    expect(storedTask.status).toBe("queued");

    // Simulate status drift caused by an out-of-band stale resume call.
    storedTask = {
      ...storedTask,
      status: "executing",
      error: "Transient provider error. Retry 1/2 in 1s.",
    };

    await vi.advanceTimersByTimeAsync(1000);

    expect(daemonLike.taskRepo.update).toHaveBeenCalledWith(taskId, { status: "queued" });
    expect(daemonLike.startTask).toHaveBeenCalledWith(expect.objectContaining({ id: taskId }));
    expect(daemonLike.pendingRetries.has(taskId)).toBe(false);
  });

  it("does not force-queue non-transient executing tasks", async () => {
    const taskId = "task-retry-no-recover";
    let storedTask: Any = {
      id: taskId,
      status: "queued",
      error: "",
    };

    const daemonLike = {
      retryCounts: new Map<string, number>(),
      pendingRetries: new Map<string, ReturnType<typeof setTimeout>>(),
      activeTasks: new Map<string, Any>([[taskId, { executor: {} }]]),
      maxTaskRetries: 2,
      retryDelayMs: 30_000,
      taskRepo: {
        findById: vi.fn(() => storedTask),
        update: vi.fn((id: string, updates: Record<string, unknown>) => {
          if (id !== taskId) return;
          storedTask = { ...storedTask, ...updates };
        }),
      },
      queueManager: {
        onTaskFinished: vi.fn(),
        isRunning: vi.fn(() => false),
        isQueued: vi.fn(() => false),
      },
      logEvent: vi.fn(),
      startTask: vi.fn(async () => {}),
      isTransientRetryErrorMessage: (message: unknown) =>
        typeof message === "string" &&
        /^Transient provider error\.\s*Retry\s+\d+\/\d+\s+in\s+\d+s\./i.test(message.trim()),
    } as Any;

    const scheduled = AgentDaemon.prototype.handleTransientTaskFailure.call(
      daemonLike,
      taskId,
      "socket hang up",
      1000,
    );

    expect(scheduled).toBe(true);

    // Drift to executing without a transient-retry marker should not be auto-corrected.
    storedTask = {
      ...storedTask,
      status: "executing",
      error: "Some other runtime error",
    };

    await vi.advanceTimersByTimeAsync(1000);

    expect(daemonLike.taskRepo.update).not.toHaveBeenCalledWith(taskId, { status: "queued" });
    expect(daemonLike.startTask).not.toHaveBeenCalled();
  });
});
