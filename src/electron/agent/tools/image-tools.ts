import { Workspace } from '../../../shared/types';
import { AgentDaemon } from '../daemon';
import { ImageGenerator, ImageModel, AspectRatio, ImageGenerationResult } from '../skills/image-generator';
import { LLMTool } from '../llm/types';

/**
 * ImageTools - Tools for AI image generation using Nano Banana models
 *
 * Provides two image generation models:
 * - Nano Banana: Fast generation for quick iterations
 * - Nano Banana Pro: High-quality generation for production use
 */
export class ImageTools {
  private imageGenerator: ImageGenerator;

  constructor(
    private workspace: Workspace,
    private daemon: AgentDaemon,
    private taskId: string
  ) {
    this.imageGenerator = new ImageGenerator(workspace);
  }

  /**
   * Generate an image from a text prompt
   */
  async generateImage(input: {
    prompt: string;
    model?: ImageModel;
    filename?: string;
    aspectRatio?: AspectRatio;
    numberOfImages?: number;
  }): Promise<ImageGenerationResult> {
    if (!this.workspace.permissions.write) {
      throw new Error('Write permission not granted for image generation');
    }

    const result = await this.imageGenerator.generate({
      prompt: input.prompt,
      model: input.model || 'nano-banana',
      filename: input.filename,
      aspectRatio: input.aspectRatio || '1:1',
      numberOfImages: input.numberOfImages || 1,
    });

    // Log events for generated images
    if (result.success) {
      for (const image of result.images) {
        this.daemon.logEvent(this.taskId, 'file_created', {
          path: image.filename,
          type: 'image',
          mimeType: image.mimeType,
          size: image.size,
          model: result.model,
        });
      }
    } else {
      this.daemon.logEvent(this.taskId, 'error', {
        action: 'generate_image',
        error: result.error,
      });
    }

    return result;
  }

  /**
   * Check if image generation is available
   */
  static isAvailable(): boolean {
    return ImageGenerator.isAvailable();
  }

  /**
   * Get tool definitions for image generation
   */
  static getToolDefinitions(): LLMTool[] {
    return [
      {
        name: 'generate_image',
        description: `Generate an image from a text description using AI. Two models are available:
- nano-banana: Fast generation for quick iterations and previews
- nano-banana-pro: High-quality generation for production-ready images

The generated images are saved to the workspace folder.`,
        input_schema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Detailed text description of the image to generate. Be specific about subject, style, colors, composition, lighting, etc.',
            },
            model: {
              type: 'string',
              enum: ['nano-banana', 'nano-banana-pro'],
              description: 'The model to use. "nano-banana" for fast generation, "nano-banana-pro" for high quality (default: nano-banana)',
            },
            filename: {
              type: 'string',
              description: 'Output filename without extension (optional, defaults to generated_<timestamp>)',
            },
            aspectRatio: {
              type: 'string',
              enum: ['1:1', '16:9', '9:16', '4:3', '3:4'],
              description: 'Aspect ratio of the generated image (default: 1:1)',
            },
            numberOfImages: {
              type: 'number',
              description: 'Number of images to generate (1-4, default: 1)',
            },
          },
          required: ['prompt'],
        },
      },
    ];
  }
}
