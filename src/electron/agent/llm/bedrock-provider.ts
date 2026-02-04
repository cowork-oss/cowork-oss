import {
  BedrockRuntimeClient,
  BedrockRuntimeClientConfig,
  ConverseCommand,
  ContentBlock,
  Message,
  SystemContentBlock,
  ToolConfiguration,
  ToolInputSchema,
  StopReason,
} from '@aws-sdk/client-bedrock-runtime';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import {
  LLMProvider,
  LLMProviderConfig,
  LLMRequest,
  LLMResponse,
  LLMContent,
  LLMMessage,
  LLMTool,
} from './types';

/**
 * AWS Bedrock provider implementation
 * Uses the Converse API for AI models
 */
export class BedrockProvider implements LLMProvider {
  readonly type = 'bedrock' as const;
  private client: BedrockRuntimeClient;
  private model: string;

  private static readonly toolNameRegex = /^[a-zA-Z0-9_-]+$/;

  constructor(config: LLMProviderConfig) {
    const clientConfig: BedrockRuntimeClientConfig = {
      region: config.awsRegion || 'us-east-1',
    };

    // Store the model for use in testConnection
    this.model = config.model || 'anthropic.claude-3-5-sonnet-20241022-v2:0';

    // Use explicit credentials if provided
    if (config.awsAccessKeyId && config.awsSecretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey,
        ...(config.awsSessionToken && { sessionToken: config.awsSessionToken }),
      };
    } else if (config.awsProfile) {
      // Use fromIni to load credentials from a specific profile
      // This avoids mutating process.env which could affect other code
      clientConfig.credentials = fromIni({ profile: config.awsProfile });
    }
    // Otherwise, let the SDK use default credential chain
    // (environment variables, IAM role, etc.)

    this.client = new BedrockRuntimeClient(clientConfig);
  }

  async createMessage(request: LLMRequest): Promise<LLMResponse> {
    const toolNameMap = request.tools ? this.buildToolNameMap(request.tools) : undefined;
    const messages = this.convertMessages(request.messages, toolNameMap);
    const system = this.convertSystem(request.system);
    const toolConfig = request.tools ? this.convertTools(request.tools, toolNameMap) : undefined;

    const command = new ConverseCommand({
      modelId: request.model,
      messages,
      system,
      inferenceConfig: {
        maxTokens: request.maxTokens,
      },
      ...(toolConfig && { toolConfig }),
    });

    try {
      console.log(`[Bedrock] Calling API with model: ${request.model}`);
      const response = await this.client.send(
        command,
        // Pass abort signal to allow cancellation
        request.signal ? { abortSignal: request.signal } : undefined
      );
      return this.convertResponse(response, toolNameMap);
    } catch (error: any) {
      // Handle abort errors gracefully
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        console.log(`[Bedrock] Request aborted`);
        throw new Error('Request cancelled');
      }

      console.error(`[Bedrock] API error:`, {
        name: error.name,
        message: error.message,
        code: error.$metadata?.httpStatusCode,
        requestId: error.$metadata?.requestId,
      });
      throw error;
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Send a minimal request to test the connection using the configured model
      console.log(`[Bedrock] Testing connection with model: ${this.model}`);
      const command = new ConverseCommand({
        modelId: this.model,
        messages: [
          {
            role: 'user',
            content: [{ text: 'Hi' }],
          },
        ],
        inferenceConfig: {
          maxTokens: 10,
        },
      });

      await this.client.send(command);
      return { success: true };
    } catch (error: any) {
      // Provide helpful error message for common issues
      let errorMessage = error.message || 'Failed to connect to AWS Bedrock';

      // Check for inference profile requirement
      if (errorMessage.includes('inference profile')) {
        errorMessage = `Model ${this.model} requires an inference profile. ` +
          `Try selecting a different model or create an inference profile in AWS Console.`;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private convertSystem(system: string): SystemContentBlock[] {
    return [{ text: system }];
  }

  private convertMessages(messages: LLMMessage[], toolNameMap?: ToolNameMap): Message[] {
    return messages.map((msg) => {
      const content: ContentBlock[] = [];

      if (typeof msg.content === 'string') {
        content.push({ text: msg.content });
      } else {
        for (const item of msg.content) {
          if (item.type === 'text') {
            content.push({ text: item.text });
          } else if (item.type === 'tool_use') {
            const mappedName = toolNameMap?.toProvider.get(item.name) || item.name;
            content.push({
              toolUse: {
                toolUseId: item.id,
                name: mappedName,
                input: item.input,
              },
            });
          } else if (item.type === 'tool_result') {
            content.push({
              toolResult: {
                toolUseId: item.tool_use_id,
                content: [{ text: item.content }],
                status: item.is_error ? 'error' : 'success',
              },
            });
          }
        }
      }

      return {
        role: msg.role,
        content,
      };
    });
  }

  private convertTools(tools: LLMTool[], toolNameMap?: ToolNameMap): ToolConfiguration {
    return {
      tools: tools.map((tool) => ({
        toolSpec: {
          name: toolNameMap?.toProvider.get(tool.name) || tool.name,
          description: tool.description,
          inputSchema: {
            json: tool.input_schema,
          } as ToolInputSchema,
        },
      })),
    };
  }

  private convertResponse(response: any, toolNameMap?: ToolNameMap): LLMResponse {
    const content: LLMContent[] = [];

    if (response.output?.message?.content) {
      for (const block of response.output.message.content) {
        if (block.text) {
          content.push({
            type: 'text',
            text: block.text,
          });
        } else if (block.toolUse) {
          const mappedName = toolNameMap?.fromProvider.get(block.toolUse.name) || block.toolUse.name;
          content.push({
            type: 'tool_use',
            id: block.toolUse.toolUseId,
            name: mappedName,
            input: block.toolUse.input,
          });
        }
      }
    }

    return {
      content,
      stopReason: this.mapStopReason(response.stopReason),
      usage: response.usage
        ? {
            inputTokens: response.usage.inputTokens || 0,
            outputTokens: response.usage.outputTokens || 0,
          }
        : undefined,
    };
  }

  private buildToolNameMap(tools: LLMTool[]): ToolNameMap {
    const toProvider = new Map<string, string>();
    const fromProvider = new Map<string, string>();
    const used = new Set<string>();

    for (const tool of tools) {
      let base = this.normalizeToolName(tool.name);
      if (!base) {
        base = `tool_${this.shortHash(tool.name)}`;
      }

      let candidate = base;
      if (used.has(candidate)) {
        const hashed = `${base}_${this.shortHash(tool.name)}`;
        candidate = hashed;
        let counter = 1;
        while (used.has(candidate)) {
          candidate = `${hashed}_${counter++}`;
        }
      }

      used.add(candidate);
      toProvider.set(tool.name, candidate);
      fromProvider.set(candidate, tool.name);
    }

    return { toProvider, fromProvider };
  }

  private normalizeToolName(name: string): string {
    const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    return BedrockProvider.toolNameRegex.test(sanitized) ? sanitized : '';
  }

  private shortHash(input: string): string {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  private mapStopReason(reason: StopReason | undefined): LLMResponse['stopReason'] {
    switch (reason) {
      case 'end_turn':
        return 'end_turn';
      case 'tool_use':
        return 'tool_use';
      case 'max_tokens':
        return 'max_tokens';
      case 'stop_sequence':
        return 'stop_sequence';
      default:
        return 'end_turn';
    }
  }
}

interface ToolNameMap {
  toProvider: Map<string, string>;
  fromProvider: Map<string, string>;
}
