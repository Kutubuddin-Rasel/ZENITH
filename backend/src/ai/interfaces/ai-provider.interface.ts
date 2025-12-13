/**
 * AI Provider Interface Definitions
 * Defines the contract all AI providers must implement
 */

export interface AIProviderConfig {
  name: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  timeout: number;
  maxRetries: number;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export interface AICompletionResponse {
  content: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  latencyMs: number;
}

export interface IAIProvider {
  readonly name: string;
  readonly isAvailable: boolean;

  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
  healthCheck(): Promise<boolean>;
}
