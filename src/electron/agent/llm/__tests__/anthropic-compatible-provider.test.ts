import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnthropicCompatibleProvider } from "../anthropic-compatible-provider";
import type { LLMRequest } from "../types";

function mockUnauthorizedResponse(message = "unauthorized"): Response {
  return {
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    json: vi.fn().mockResolvedValue({ error: { message } }),
  } as unknown as Response;
}

describe("AnthropicCompatibleProvider URL resolution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses /v1/messages when base URL has no version segment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockUnauthorizedResponse());
    vi.stubGlobal("fetch", fetchMock);

    const provider = new AnthropicCompatibleProvider({
      type: "minimax-portal",
      providerName: "MiniMax Portal",
      apiKey: "minimax-test",
      baseUrl: "https://api.minimax.io/anthropic",
      defaultModel: "MiniMax-M2.1",
    });

    await provider.testConnection();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.minimax.io/anthropic/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses /messages when base URL already ends with /v1", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockUnauthorizedResponse());
    vi.stubGlobal("fetch", fetchMock);

    const provider = new AnthropicCompatibleProvider({
      type: "qwen-portal",
      providerName: "Qwen",
      apiKey: "qwen-test",
      baseUrl: "https://portal.qwen.ai/v1",
      defaultModel: "qwen-model",
    });

    await provider.testConnection();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://portal.qwen.ai/v1/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses the base URL directly when it already ends with /messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockUnauthorizedResponse());
    vi.stubGlobal("fetch", fetchMock);

    const provider = new AnthropicCompatibleProvider({
      type: "anthropic-compatible",
      providerName: "Anthropic-Compatible",
      apiKey: "test-key",
      baseUrl: "https://example.com/custom/messages",
      defaultModel: "custom-model",
    });

    await provider.testConnection();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/custom/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses /v1/models when refreshing models from an unversioned Anthropic-compatible base URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [{ id: "MiniMax-M2.5", display_name: "MiniMax M2.5" }],
      }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const provider = new AnthropicCompatibleProvider({
      type: "minimax-portal",
      providerName: "MiniMax Portal",
      apiKey: "minimax-test",
      baseUrl: "https://api.minimax.io/anthropic",
      defaultModel: "MiniMax-M2.1",
    });

    await expect(provider.getAvailableModels()).resolves.toEqual([
      { id: "MiniMax-M2.5", name: "MiniMax M2.5" },
    ]);

    expect(fetchMock).toHaveBeenCalledWith("https://api.minimax.io/anthropic/v1/models", {
      headers: {
        "anthropic-version": "2023-06-01",
        "x-api-key": "minimax-test",
        Authorization: "Bearer minimax-test",
      },
    });
  });
});

describe("AnthropicCompatibleProvider tool sequencing", () => {
  let capturedBody: Any = null;

  beforeEach(() => {
    capturedBody = null;
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return {
          ok: true,
          json: async () => ({
            content: [{ type: "text", text: "ok" }],
            stop_reason: "end_turn",
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        } as Response;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rewrites orphan tool_result blocks into text", async () => {
    const provider = new AnthropicCompatibleProvider({
      type: "minimax-portal",
      providerName: "MiniMax Portal",
      apiKey: "test-key",
      baseUrl: "https://example.com/anthropic",
      defaultModel: "MiniMax-M2.5-highspeed",
    });

    const request: LLMRequest = {
      model: "MiniMax-M2.5-highspeed",
      maxTokens: 64,
      system: "system",
      messages: [
        { role: "user", content: "start" },
        { role: "assistant", content: [{ type: "text", text: "done" }] },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "missing_tool_use",
              content: '{"error":"orphan"}',
              is_error: true,
            },
          ],
        },
      ],
    };

    await provider.createMessage(request);

    expect(capturedBody.messages[2].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: "[Recovered prior tool output omitted to preserve valid tool-call sequencing.]",
        }),
      ]),
    );
    expect(
      capturedBody.messages[2].content.some((block: Any) => block.type === "tool_result"),
    ).toBe(false);
  });

  it("rewrites assistant tool_use blocks when the next user turn does not immediately return a matching tool_result", async () => {
    const provider = new AnthropicCompatibleProvider({
      type: "minimax-portal",
      providerName: "MiniMax Portal",
      apiKey: "test-key",
      baseUrl: "https://example.com/anthropic",
      defaultModel: "MiniMax-M2.5-highspeed",
    });

    const request: LLMRequest = {
      model: "MiniMax-M2.5-highspeed",
      maxTokens: 64,
      system: "system",
      messages: [
        { role: "user", content: "start" },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tool_missing_result",
              name: "read_file",
              input: { path: "a.ts" },
            },
          ],
        },
        { role: "user", content: "no tool results here" },
      ],
    };

    await provider.createMessage(request);

    expect(capturedBody.messages[1].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: "[Recovered prior tool request omitted to preserve valid tool-call sequencing.]",
        }),
      ]),
    );
    expect(
      capturedBody.messages[1].content.some((block: Any) => block.type === "tool_use"),
    ).toBe(false);
  });
});
