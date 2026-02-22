import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Stream } from 'openai/streaming';
import { ChatCompletionChunk } from 'openai/resources/chat/completions';

/**
 * Return type for streamChat — exposes the Stream object (which has
 * .controller: AbortController for teardown on client disconnect).
 */
export interface ChatStream {
  stream: Stream<ChatCompletionChunk>;
}

@Injectable()
export class OpenAiService {
  private openai: OpenAI;
  private readonly logger = new Logger(OpenAiService.name);

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      this.logger.warn(
        'OPENAI_API_KEY not found. AI features will be disabled.',
      );
    }
  }

  async generateText(prompt: string, model = 'gpt-3.5-turbo'): Promise<string> {
    if (!this.openai) return '';
    try {
      const completion = await this.openai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model,
      });
      return completion.choices[0].message.content || '';
    } catch (error) {
      this.logger.error('OpenAI generation failed', error);
      return '';
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.openai) return [];
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text.replace(/\n/g, ' '),
      });
      return response.data[0].embedding;
    } catch (error) {
      this.logger.error('OpenAI embedding failed', error);
      return [];
    }
  }

  /**
   * @deprecated Use streamChat() instead for proper system/user messages and typed streams.
   */
  async streamText(
    prompt: string,
    model = 'gpt-3.5-turbo',
  ): Promise<AsyncIterable<ChatCompletionChunk>> {
    if (!this.openai) throw new Error('OpenAI not initialized');
    try {
      const stream = await this.openai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model,
        stream: true,
      });
      return stream;
    } catch (error) {
      this.logger.error('OpenAI streaming failed', error);
      throw error;
    }
  }

  /**
   * Stream a chat completion with system + user messages.
   *
   * Returns a ChatStream which includes the OpenAI Stream object.
   * The Stream has a `.controller: AbortController` property that can
   * be used to abort the request on client disconnect (e.g., browser tab close).
   *
   * DEEP THINKING — CLIENT DISCONNECT TEARDOWN:
   * When the RxJS Observable tears down (subscriber unsubscribes),
   * calling `stream.controller.abort()` sends an AbortSignal to the
   * underlying HTTP request, immediately stopping the OpenAI stream
   * and preventing wasted API credits.
   *
   * @param systemPrompt - System instructions for the LLM
   * @param userMessage - The user's query
   * @param model - OpenAI model to use
   */
  async streamChat(
    systemPrompt: string,
    userMessage: string,
    model = 'gpt-4o-mini',
  ): Promise<ChatStream> {
    if (!this.openai) throw new Error('OpenAI not initialized');

    const stream = await this.openai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      model,
      stream: true,
      temperature: 0.3, // Low temp for factual, citation-heavy responses
    });

    return { stream };
  }
}
