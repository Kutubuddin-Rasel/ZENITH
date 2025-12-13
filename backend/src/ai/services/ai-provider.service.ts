/**
 * AI Provider Service
 * Orchestrates multiple AI providers with automatic failover
 * Primary: OpenRouter (Llama 3.3) -> Fallback: Gemini Flash
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OpenRouterProvider } from '../providers/openrouter.provider';
import { GeminiProvider } from '../providers/gemini.provider';
import { GroqProvider } from '../providers/groq.provider';
import {
  IAIProvider,
  AICompletionRequest,
  AICompletionResponse,
} from '../interfaces/ai-provider.interface';

@Injectable()
export class AIProviderService implements OnModuleInit {
  private readonly logger = new Logger(AIProviderService.name);
  private providers: IAIProvider[] = [];

  constructor(
    private openRouterProvider: OpenRouterProvider,
    private geminiProvider: GeminiProvider,
    private groqProvider: GroqProvider,
  ) { }

  onModuleInit() {
    // Initialize provider chain: Groq -> OpenRouter (Llama) -> Gemini
    // Order matters - first available provider is tried first
    const allProviders = [
      this.groqProvider,
      this.openRouterProvider,
      this.geminiProvider,
    ];

    this.providers = allProviders.filter((p) => p.isAvailable);

    if (this.providers.length === 0) {
      this.logger.warn(
        '⚠️ No AI providers available. AI features will be disabled. ' +
        'Set OPENROUTER_API_KEY or GOOGLE_AI_API_KEY in .env to enable.',
      );
    } else {
      this.logger.log(
        `✅ AI providers initialized: ${this.providers.map((p) => p.name).join(' → ')}`,
      );
    }
  }

  /**
   * Check if any AI provider is available
   */
  get isAvailable(): boolean {
    return this.providers.some((p) => p.isAvailable);
  }

  /**
   * Get list of currently available providers
   */
  get availableProviders(): string[] {
    return this.providers.filter((p) => p.isAvailable).map((p) => p.name);
  }

  /**
   * Execute completion with automatic failover
   * Tries providers in order until one succeeds
   */
  async complete(
    request: AICompletionRequest,
  ): Promise<AICompletionResponse | null> {
    for (const provider of this.providers) {
      if (!provider.isAvailable) {
        this.logger.debug(`Skipping ${provider.name}: not available`);
        continue;
      }

      try {
        this.logger.debug(`Attempting completion with ${provider.name}...`);
        const response = await provider.complete(request);
        this.logger.log(
          `✅ ${provider.name} completed in ${response.latencyMs}ms`,
        );
        return response;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `${provider.name} failed: ${errorMessage}, trying next provider...`,
        );
      }
    }

    this.logger.error('All AI providers failed or unavailable');
    return null;
  }

  /**
   * Run health check on all providers
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const provider of [
      this.groqProvider,
      this.openRouterProvider,
      this.geminiProvider,
    ]) {
      try {
        results[provider.name] = await provider.healthCheck();
      } catch {
        results[provider.name] = false;
      }
    }

    return results;
  }

  /**
   * Get provider status for monitoring
   */
  getStatus(): {
    available: boolean;
    providers: Array<{ name: string; available: boolean }>;
  } {
    return {
      available: this.isAvailable,
      providers: [
        this.groqProvider,
        this.openRouterProvider,
        this.geminiProvider,
      ].map((p) => ({
        name: p.name,
        available: p.isAvailable,
      })),
    };
  }
}
