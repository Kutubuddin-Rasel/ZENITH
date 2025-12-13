/**
 * Groq AI Provider
 * High-performance inference provider using Llama 3 70B
 * Base URL: https://api.groq.com/openai/v1
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
export class GroqProvider extends BaseAIProvider {
    private client: OpenAI | null = null;

    constructor(private configService: ConfigService) {
        const apiKey = configService.get<string>('GROQ_API_KEY');

        super({
            name: 'Groq',
            apiKey: apiKey || '',
            baseUrl: 'https://api.groq.com/openai/v1',
            model: 'llama3-70b-8192', // Fast, high-quality, free tier available
            timeout: 30000,
            maxRetries: 2,
        });

        if (apiKey) {
            this.client = new OpenAI({
                apiKey,
                baseURL: 'https://api.groq.com/openai/v1',
                defaultHeaders: {
                    'HTTP-Referer': 'https://zenith.app',
                    'X-Title': 'Zenith Project Management',
                },
            });
            this.logger.log(
                `Groq provider initialized with model: ${this.config.model}`,
            );
        } else {
            this.logger.warn(
                'GROQ_API_KEY not set. Groq provider disabled.',
            );
        }
    }

    async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
        if (!this.client || !this.isAvailable) {
            throw new Error('Groq provider not available');
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
            this.logger.error(`Groq completion failed: ${errorMessage}`);
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
