/**
 * Google Gemini AI Provider (via OpenRouter)
 * Fallback provider using Gemini 2.0 Flash Exp model
 * Uses OpenRouter API for unified access
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { BaseAIProvider } from './base.provider';
import {
  AICompletionRequest,
  AICompletionResponse,
} from '../interfaces/ai-provider.interface';

@Injectable()
export class GeminiProvider extends BaseAIProvider {
  private client: OpenAI | null = null;

  constructor(private configService: ConfigService) {
    // Use the same OpenRouter API key for Gemini access
    const apiKey = configService.get<string>('OPENROUTER_API_KEY');

    super({
      name: 'Gemini',
      apiKey: apiKey || '',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'google/gemini-2.0-flash-exp:free',
      timeout: 30000,
      maxRetries: 2,
    });

    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://zenith.app',
          'X-Title': 'Zenith Project Management',
        },
      });
      this.logger.log(
        `Gemini provider initialized via OpenRouter with model: ${this.config.model}`,
      );
    } else {
      this.logger.warn('OPENROUTER_API_KEY not set. Gemini provider disabled.');
    }
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    if (!this.client || !this.isAvailable) {
      throw new Error('Gemini provider not available');
    }

    const startTime = Date.now();

    try {
      const response = await this.withTimeout(
        this.client.chat.completions.create({
          model: this.config.model,
          messages: request.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 1000,
          response_format:
            request.responseFormat === 'json'
              ? { type: 'json_object' }
              : undefined,
        }),
        this.config.timeout,
      );

      this.recordSuccess();

      const content = response.choices[0]?.message?.content || '';

      return {
        content,
        model: response.model,
        provider: this.name,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
        },
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      this.recordFailure();
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Gemini completion failed: ${errorMessage}`);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.client || !this._isAvailable) {
      return false;
    }

    try {
      await this.complete({
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 5,
        temperature: 0,
      });
      return true;
    } catch {
      return false;
    }
  }
}
