/**
 * Tests for custom provider config resolution
 * Ensures alias fallback is logged and resolved configs are preferred.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { LLMProviderFactory } from "../provider-factory";
import type { CustomProviderConfig } from "../../../../shared/types";

const dummyModelKey = "sonnet";

function getModelIdWithCustomProviders(
  providerType: "kimi-coding" | "kimi-code",
  customProviders: Record<string, CustomProviderConfig>,
) {
  return LLMProviderFactory.getModelId(
    dummyModelKey,
    providerType,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    customProviders,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LLMProviderFactory custom provider config resolution", () => {
  it("logs when falling back from resolved alias to providerType config", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const customProviders: Record<string, CustomProviderConfig> = {
      "kimi-coding": {
        apiKey: "test-key",
        model: "custom-model",
      },
    };

    const modelId = getModelIdWithCustomProviders("kimi-coding", customProviders);

    expect(modelId).toBe("custom-model");
    expect(logSpy).toHaveBeenCalledWith(
      '[LLMProviderFactory] Custom provider config not found for "kimi-code", falling back to "kimi-coding".',
    );
  });

  it("prefers resolved alias config when present without logging", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const customProviders: Record<string, CustomProviderConfig> = {
      "kimi-code": {
        apiKey: "resolved-key",
        model: "resolved-model",
      },
      "kimi-coding": {
        apiKey: "fallback-key",
        model: "fallback-model",
      },
    };

    const modelId = getModelIdWithCustomProviders("kimi-coding", customProviders);

    expect(modelId).toBe("resolved-model");
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("uses Azure deployment name when provider type is azure", () => {
    const modelId = LLMProviderFactory.getModelId(
      dummyModelKey,
      "azure",
      undefined,
      undefined,
      undefined,
      undefined,
      "my-deployment",
      undefined,
      undefined,
      undefined,
      undefined,
    );

    expect(modelId).toBe("my-deployment");
  });

  it("prefers explicit bedrock model ID when provider type is bedrock", () => {
    const modelId = LLMProviderFactory.getModelId(
      "sonnet-3-5",
      "bedrock",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "us.anthropic.claude-opus-4-6-20260115-v1:0",
    );

    expect(modelId).toBe("us.anthropic.claude-opus-4-6-20260115-v1:0");
  });

  it("uses cached custom-provider models when available", () => {
    const modelStatus = LLMProviderFactory.getProviderModelStatus({
      providerType: "minimax-portal",
      modelKey: "sonnet-3-5",
      customProviders: {
        "minimax-portal": {
          apiKey: "minimax-test",
          model: "MiniMax-M2.5",
          cachedModels: [
            {
              key: "MiniMax-M2.5",
              displayName: "MiniMax M2.5",
              description: "MiniMax Portal model",
            },
            {
              key: "MiniMax-M2.1",
              displayName: "MiniMax M2.1",
              description: "MiniMax Portal model",
            },
          ],
        },
      },
    } as Any);

    expect(modelStatus.currentModel).toBe("MiniMax-M2.5");
    expect(modelStatus.models).toEqual([
      {
        key: "MiniMax-M2.5",
        displayName: "MiniMax M2.5",
        description: "MiniMax Portal model",
      },
      {
        key: "MiniMax-M2.1",
        displayName: "MiniMax M2.1",
        description: "MiniMax Portal model",
      },
    ]);
  });

  it("returns documented MiniMax Portal models when refreshing custom-provider models", async () => {
    vi.spyOn(LLMProviderFactory, "loadSettings").mockReturnValue({
      providerType: "minimax-portal",
      modelKey: "sonnet-3-5",
      customProviders: {
        "minimax-portal": {
          apiKey: "minimax-test",
          model: "MiniMax-M2.5",
        },
      },
    } as Any);
    const saveSpy = vi.spyOn(LLMProviderFactory, "saveSettings").mockImplementation(() => {});

    await expect(LLMProviderFactory.getCustomProviderModels("minimax-portal")).resolves.toEqual([
      {
        key: "MiniMax-M2.5",
        displayName: "MiniMax-M2.5",
        description: "MiniMax Portal model",
      },
      {
        key: "MiniMax-M2.5-highspeed",
        displayName: "MiniMax-M2.5-highspeed",
        description: "MiniMax Portal model",
      },
      {
        key: "MiniMax-M2.1",
        displayName: "MiniMax-M2.1",
        description: "MiniMax Portal model",
      },
      {
        key: "MiniMax-M2.1-highspeed",
        displayName: "MiniMax-M2.1-highspeed",
        description: "MiniMax Portal model",
      },
      {
        key: "MiniMax-M2",
        displayName: "MiniMax-M2",
        description: "MiniMax Portal model",
      },
    ]);

    expect(saveSpy).toHaveBeenCalled();
  });
});
