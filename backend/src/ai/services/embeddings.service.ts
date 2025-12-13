import { Injectable } from '@nestjs/common';
import { OpenAiService } from './openai.service';

@Injectable()
export class EmbeddingsService {
  constructor(private openAiService: OpenAiService) {}

  async create(text: string): Promise<number[]> {
    return this.openAiService.generateEmbedding(text);
  }
}
