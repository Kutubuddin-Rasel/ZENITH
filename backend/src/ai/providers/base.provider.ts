/**
 * Base AI Provider
 * Abstract base class with common functionality including circuit breaker
 */

import { Logger } from '@nestjs/common';
import {
  IAIProvider,
  AIProviderConfig,
  AICompletionRequest,
  AICompletionResponse,
} from '../interfaces/ai-provider.interface';

export abstract class BaseAIProvider implements IAIProvider {
  protected readonly logger: Logger;
  protected readonly config: AIProviderConfig;
  protected _isAvailable: boolean = false;
  protected consecutiveFailures: number = 0;
  protected readonly MAX_FAILURES = 3;
  protected circuitOpenUntil: Date | null = null;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.logger = new Logger(`AIProvider:${config.name}`);
    this._isAvailable = !!config.apiKey;
  }

  get name(): string {
    return this.config.name;
  }

  get isAvailable(): boolean {
    // Circuit breaker pattern - skip if circuit is open
    if (this.circuitOpenUntil && new Date() < this.circuitOpenUntil) {
      return false;
    }

    // Reset circuit if timeout has passed
    if (this.circuitOpenUntil && new Date() >= this.circuitOpenUntil) {
      this.circuitOpenUntil = null;
      this.consecutiveFailures = 0;
      this.logger.log(`Circuit closed for ${this.name}, resuming operations`);
    }

    return this._isAvailable;
  }

  /**
   * Record a failure - opens circuit after MAX_FAILURES consecutive failures
   */
  protected recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.MAX_FAILURES) {
      // Open circuit for 60 seconds
      this.circuitOpenUntil = new Date(Date.now() + 60000);
      this.logger.warn(
        `Circuit opened for ${this.name} until ${this.circuitOpenUntil.toISOString()}`,
      );
    }
  }

  /**
   * Record a success - resets consecutive failure counter
   */
  protected recordSuccess(): void {
    this.consecutiveFailures = 0;
  }

  /**
   * Execute completion with timeout
   */
  protected async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Request timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });

    return Promise.race([promise, timeoutPromise]);
  }

  abstract complete(
    request: AICompletionRequest,
  ): Promise<AICompletionResponse>;
  abstract healthCheck(): Promise<boolean>;
}
