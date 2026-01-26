import * as fs from 'fs';
import * as path from 'path';
import { Workspace } from '../../../shared/types';
import { LLMProviderFactory } from '../llm/provider-factory';

/**
 * Image generation model types
 * - nano-banana: Fast, efficient image generation (Imagen 3.0 Fast)
 * - nano-banana-pro: High-quality image generation (Imagen 3.0)
 */
export type ImageModel = 'nano-banana' | 'nano-banana-pro';

/**
 * Image aspect ratio options
 */
export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

/**
 * Image generation request
 */
export interface ImageGenerationRequest {
  prompt: string;
  model?: ImageModel;
  filename?: string;
  aspectRatio?: AspectRatio;
  numberOfImages?: number;
}

/**
 * Image generation result
 */
export interface ImageGenerationResult {
  success: boolean;
  images: Array<{
    path: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
  model: string;
  error?: string;
}

/**
 * Map our model names to Gemini Imagen model IDs
 */
const MODEL_MAP: Record<ImageModel, string> = {
  'nano-banana': 'imagen-3.0-fast-generate-001',
  'nano-banana-pro': 'imagen-3.0-generate-002',
};

/**
 * ImageGenerator - Generates images using Google's Imagen models via Gemini API
 *
 * Supports two models:
 * - Nano Banana: Fast generation for quick iterations (imagen-3.0-fast-generate-001)
 * - Nano Banana Pro: High-quality generation for production use (imagen-3.0-generate-002)
 */
export class ImageGenerator {
  constructor(private workspace: Workspace) {}

  /**
   * Generate images from a text prompt
   */
  async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const {
      prompt,
      model = 'nano-banana',
      filename,
      aspectRatio = '1:1',
      numberOfImages = 1,
    } = request;

    // Get Gemini API key from settings
    const settings = LLMProviderFactory.loadSettings();
    const apiKey = settings.gemini?.apiKey;

    if (!apiKey) {
      return {
        success: false,
        images: [],
        model: MODEL_MAP[model],
        error: 'Gemini API key not configured. Please configure it in Settings to use image generation.',
      };
    }

    const modelId = MODEL_MAP[model];
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:predict`;

    try {
      console.log(`[ImageGenerator] Generating ${numberOfImages} image(s) with ${model} (${modelId})`);
      console.log(`[ImageGenerator] Prompt: "${prompt.substring(0, 100)}..."`);

      const response = await fetch(`${endpoint}?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [
            {
              prompt: prompt,
            },
          ],
          parameters: {
            sampleCount: Math.min(numberOfImages, 4), // Max 4 images per request
            aspectRatio: aspectRatio,
            personGeneration: 'allow_adult', // Allow generating people
            safetyFilterLevel: 'block_some', // Moderate safety filter
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[ImageGenerator] API error: ${response.status} ${response.statusText}`);
        console.error(`[ImageGenerator] Error body:`, errorBody);

        // Parse error for better message
        let errorMessage = `Image generation failed: ${response.status}`;
        try {
          const errorJson = JSON.parse(errorBody);
          if (errorJson.error?.message) {
            errorMessage = errorJson.error.message;
          }
        } catch {
          // Use default message
        }

        return {
          success: false,
          images: [],
          model: modelId,
          error: errorMessage,
        };
      }

      const data = await response.json() as { predictions?: Array<{ bytesBase64Encoded?: string }> };
      const predictions = data.predictions || [];

      if (predictions.length === 0) {
        return {
          success: false,
          images: [],
          model: modelId,
          error: 'No images were generated. The prompt may have been blocked by safety filters.',
        };
      }

      // Save generated images
      const images: ImageGenerationResult['images'] = [];
      const baseFilename = filename || `generated_${Date.now()}`;
      const outputDir = this.workspace.path;

      for (let i = 0; i < predictions.length; i++) {
        const prediction = predictions[i];
        const imageBytes = prediction.bytesBase64Encoded;

        if (!imageBytes) {
          console.warn(`[ImageGenerator] Prediction ${i} has no image data`);
          continue;
        }

        // Determine filename
        const imageName = predictions.length > 1
          ? `${baseFilename}_${i + 1}.png`
          : `${baseFilename}.png`;
        const outputPath = path.join(outputDir, imageName);

        // Decode and save image
        const imageBuffer = Buffer.from(imageBytes, 'base64');
        await fs.promises.writeFile(outputPath, imageBuffer);

        const stats = await fs.promises.stat(outputPath);

        images.push({
          path: outputPath,
          filename: imageName,
          mimeType: 'image/png',
          size: stats.size,
        });

        console.log(`[ImageGenerator] Saved image: ${imageName} (${stats.size} bytes)`);
      }

      return {
        success: true,
        images,
        model: modelId,
      };
    } catch (error: any) {
      console.error(`[ImageGenerator] Error:`, error);
      return {
        success: false,
        images: [],
        model: modelId,
        error: error.message || 'Failed to generate image',
      };
    }
  }

  /**
   * Check if image generation is available (API key configured)
   */
  static isAvailable(): boolean {
    const settings = LLMProviderFactory.loadSettings();
    return !!settings.gemini?.apiKey;
  }

  /**
   * Get available image generation models
   */
  static getAvailableModels(): Array<{
    id: ImageModel;
    name: string;
    description: string;
    modelId: string;
  }> {
    return [
      {
        id: 'nano-banana',
        name: 'Nano Banana',
        description: 'Fast image generation - great for quick iterations and previews',
        modelId: MODEL_MAP['nano-banana'],
      },
      {
        id: 'nano-banana-pro',
        name: 'Nano Banana Pro',
        description: 'High-quality image generation - best for final outputs',
        modelId: MODEL_MAP['nano-banana-pro'],
      },
    ];
  }
}
