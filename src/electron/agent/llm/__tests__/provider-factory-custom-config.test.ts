/**
 * Tests for custom provider config resolution
 * Ensures alias fallback is logged and resolved configs are preferred.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { LLMProviderFactory } from '../provider-factory';
import type { CustomProviderConfig } from '../../../../shared/types';

const dummyModelKey = 'sonnet';

function getModelIdWithCustomProviders(
  providerType: 'kimi-coding' | 'kimi-code',
  customProviders: Record<string, CustomProviderConfig>
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
    customProviders
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LLMProviderFactory custom provider config resolution', () => {
  it('logs when falling back from resolved alias to providerType config', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const customProviders: Record<string, CustomProviderConfig> = {
      'kimi-coding': {
        apiKey: 'test-key',
        model: 'custom-model',
      },
    };

    const modelId = getModelIdWithCustomProviders('kimi-coding', customProviders);

    expect(modelId).toBe('custom-model');
    expect(logSpy).toHaveBeenCalledWith(
      '[LLMProviderFactory] Custom provider config not found for "kimi-code", falling back to "kimi-coding".'
    );
  });

  it('prefers resolved alias config when present without logging', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const customProviders: Record<string, CustomProviderConfig> = {
      'kimi-code': {
        apiKey: 'resolved-key',
        model: 'resolved-model',
      },
      'kimi-coding': {
        apiKey: 'fallback-key',
        model: 'fallback-model',
      },
    };

    const modelId = getModelIdWithCustomProviders('kimi-coding', customProviders);

    expect(modelId).toBe('resolved-model');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('uses Azure deployment name when provider type is azure', () => {
    const modelId = LLMProviderFactory.getModelId(
      dummyModelKey,
      'azure',
      undefined,
      undefined,
      undefined,
      undefined,
      'my-deployment',
      undefined,
      undefined,
      undefined,
      undefined
    );

    expect(modelId).toBe('my-deployment');
  });

  it('prefers explicit bedrock model ID when provider type is bedrock', () => {
    const modelId = LLMProviderFactory.getModelId(
      'sonnet-3-5',
      'bedrock',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'us.anthropic.claude-opus-4-6-20260115-v1:0'
    );

    expect(modelId).toBe('us.anthropic.claude-opus-4-6-20260115-v1:0');
  });
});
