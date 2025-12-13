import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

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
  async streamText(
    prompt: string,
    model = 'gpt-3.5-turbo',
  ): Promise<AsyncIterable<any>> {
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
}
