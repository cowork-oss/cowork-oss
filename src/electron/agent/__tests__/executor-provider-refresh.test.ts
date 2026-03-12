import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextManager } from "../context-manager";
import { TaskExecutor } from "../executor";
import { LLMProviderFactory } from "../llm";

describe("TaskExecutor provider refresh", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes provider before an LLM call and uses the refreshed model id", async () => {
    const oldProvider = {
      type: "ollama",
      createMessage: vi.fn(async () => ({ content: [], usage: undefined })),
    };
    const newProvider = {
      type: "minimax-portal",
      createMessage: vi.fn(async () => ({ content: [], usage: undefined })),
    };

    vi.spyOn(LLMProviderFactory, "resolveTaskModelSelection").mockReturnValue({
      providerType: "minimax-portal",
      modelId: "mini-max-model",
      modelKey: "gpt-4.1",
      llmProfileUsed: "strong",
      resolvedModelKey: "gpt-4.1",
      modelSource: "provider_default",
    } as Any);
    vi.spyOn(LLMProviderFactory, "createProvider").mockReturnValue(newProvider as Any);

    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-1",
      title: "Automatic task",
      agentConfig: {},
    };
    executor.provider = oldProvider;
    executor.modelId = "qwen3.5:35b";
    executor.modelKey = "opus-4-5";
    executor.llmProfileUsed = "strong";
    executor.resolvedModelKey = "opus-4-5";
    executor.contextManager = new ContextManager("opus-4-5");
    executor.abortController = new AbortController();
    executor.cancelled = false;
    executor.taskCompleted = false;
    executor.emitEvent = vi.fn();
    executor.logTag = "[Executor:test]";
    executor.getCumulativeInputTokens = vi.fn(() => 0);
    executor.getCumulativeOutputTokens = vi.fn(() => 0);

    await executor.createMessageWithTimeout(
      {
        model: "qwen3.5:35b",
        maxTokens: 64,
        system: "test",
        messages: [],
      },
      1000,
      "Test operation",
    );

    expect(oldProvider.createMessage).not.toHaveBeenCalled();
    expect(newProvider.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mini-max-model",
      }),
    );
    expect(executor.provider).toBe(newProvider);
    expect(executor.modelId).toBe("mini-max-model");
    expect(executor.contextManager).toBeInstanceOf(ContextManager);
  });

  it("switches to the new global provider even when the task has an older model override", async () => {
    const oldProvider = {
      type: "minimax-portal",
      createMessage: vi.fn(async () => ({ content: [], usage: undefined })),
    };
    const newProvider = {
      type: "ollama",
      createMessage: vi.fn(async () => ({ content: [], usage: undefined })),
    };

    vi.spyOn(LLMProviderFactory, "loadSettings").mockReturnValue({
      providerType: "ollama",
      ollama: { model: "qwen3.5:latest" },
    } as Any);
    vi.spyOn(LLMProviderFactory, "resolveTaskModelSelection").mockReturnValue({
      providerType: "ollama",
      modelId: "qwen3.5:latest",
      modelKey: "qwen3.5:latest",
      llmProfileUsed: "cheap",
      resolvedModelKey: "qwen3.5:latest",
      modelSource: "provider_default",
      warnings: [],
    } as Any);
    vi.spyOn(LLMProviderFactory, "createProvider").mockReturnValue(newProvider as Any);

    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "task-2",
      title: "Automatic task",
      agentConfig: {
        modelKey: "MiniMax-M2.5-highspeed",
      },
    };
    executor.provider = oldProvider;
    executor.modelId = "MiniMax-M2.5-highspeed";
    executor.modelKey = "MiniMax-M2.5-highspeed";
    executor.llmProfileUsed = "strong";
    executor.resolvedModelKey = "MiniMax-M2.5-highspeed";
    executor.contextManager = new ContextManager("MiniMax-M2.5-highspeed");
    executor.abortController = new AbortController();
    executor.cancelled = false;
    executor.taskCompleted = false;
    executor.emitEvent = vi.fn();
    executor.logTag = "[Executor:test]";
    executor.getCumulativeInputTokens = vi.fn(() => 0);
    executor.getCumulativeOutputTokens = vi.fn(() => 0);

    await executor.createMessageWithTimeout(
      {
        model: "MiniMax-M2.5-highspeed",
        maxTokens: 64,
        system: "test",
        messages: [],
      },
      1000,
      "Test operation",
    );

    expect(oldProvider.createMessage).not.toHaveBeenCalled();
    expect(newProvider.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "qwen3.5:latest",
      }),
    );
    expect(LLMProviderFactory.resolveTaskModelSelection).toHaveBeenCalledWith(
      expect.not.objectContaining({
        modelKey: "MiniMax-M2.5-highspeed",
      }),
      expect.any(Object),
    );
    expect(executor.provider).toBe(newProvider);
    expect(executor.modelId).toBe("qwen3.5:latest");
  });
});
