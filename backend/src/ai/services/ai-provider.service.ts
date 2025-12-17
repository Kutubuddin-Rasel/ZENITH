/**
 * AI Provider Service
 * Orchestrates multiple AI providers with automatic failover
 * Primary: OpenRouter (Llama 3.3) -> Fallback: Gemini Flash
 *
 * PHASE 3: Now uses IntegrationGateway with circuit breakers for resilience.
 */

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { OpenRouterProvider } from '../providers/openrouter.provider';
import { GeminiProvider } from '../providers/gemini.provider';
import { GroqProvider } from '../providers/groq.provider';
import {
  IAIProvider,
  AICompletionRequest,
  AICompletionResponse,
} from '../interfaces/ai-provider.interface';
import { IntegrationGateway } from '../../core/integrations/integration.gateway';

// Static fallback response when all AI providers are unavailable
const AI_UNAVAILABLE_RESPONSE: AICompletionResponse = {
  content: 'AI analysis unavailable at the moment.',
  provider: 'fallback',
  model: 'none',
  latencyMs: 0,
};

@Injectable()
export class AIProviderService implements OnModuleInit {
  private readonly logger = new Logger(AIProviderService.name);
  private providers: IAIProvider[] = [];

  constructor(
    private openRouterProvider: OpenRouterProvider,
    private geminiProvider: GeminiProvider,
    private groqProvider: GroqProvider,
    @Optional() private gateway?: IntegrationGateway,
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

    if (this.gateway) {
      this.logger.log('🔒 Circuit breaker protection enabled for AI calls');
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
   * Execute completion with automatic failover and circuit breaker protection
   * Tries providers in order until one succeeds.
   *
   * PHASE 3: Now wrapped in IntegrationGateway for resilience.
   * Returns fallback message instead of null when all providers fail.
   */
  async complete(
    request: AICompletionRequest,
  ): Promise<AICompletionResponse> {
    // If no gateway, use legacy behavior
    if (!this.gateway) {
      return (await this.completeWithFailover(request)) ?? AI_UNAVAILABLE_RESPONSE;
    }

    // Use circuit breaker for resilient execution
    return this.gateway.execute<AICompletionResponse>(
      {
        name: 'ai-providers',
        timeout: 30000, // AI calls can take longer
        errorThresholdPercentage: 50,
        resetTimeout: 60000, // Wait 1 minute before retrying
      },
      async () => {
        const result = await this.completeWithFailover(request);
        if (!result) {
          throw new Error('All AI providers failed');
        }
        return result;
      },
      // Fallback when circuit is open
      () => {
        this.logger.warn('Circuit open: returning static AI fallback');
        return AI_UNAVAILABLE_RESPONSE;
      },
    );
  }

  /**
   * Legacy failover logic - tries each provider in sequence
   */
  private async completeWithFailover(
    request: AICompletionRequest,
  ): Promise<AICompletionResponse | null> {
    // 🔥 CHAOS TEST: Force 100% failure - SET TO false TO DISABLE
    const CHAOS_MODE = false; // ← DISABLED after successful test
    if (CHAOS_MODE) {
      this.logger.error('🔥 CHAOS MODE: Simulating AI provider failure');
      throw new Error('Simulated network outage');
    }

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
   * Safe complete - always returns a response (never throws)
   * Use this for non-critical AI features where failure shouldn't break the flow.
   */
  async safeComplete(
    request: AICompletionRequest,
  ): Promise<AICompletionResponse> {
    try {
      return await this.complete(request);
    } catch (error) {
      this.logger.error(`Safe complete error: ${error}`);
      return AI_UNAVAILABLE_RESPONSE;
    }
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

    // Add circuit breaker status
    if (this.gateway) {
      results['circuit-breaker'] = this.gateway.isHealthy('ai-providers');
    }

    return results;
  }

  /**
   * Get provider status for monitoring
   */
  getStatus(): {
    available: boolean;
    circuitBreakerEnabled: boolean;
    providers: Array<{ name: string; available: boolean }>;
  } {
    return {
      available: this.isAvailable,
      circuitBreakerEnabled: !!this.gateway,
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
