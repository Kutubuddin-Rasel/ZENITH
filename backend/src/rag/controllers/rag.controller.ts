import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { IngestionService } from '../services/ingestion.service';
import { RetrievalService } from '../services/retrieval.service';
import { OpenAiService } from '../../ai/services/openai.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../core/auth/guards/permissions.guard';

@Controller('projects/:projectId/rag')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RagController {
  constructor(
    private readonly ingestionService: IngestionService,
    private readonly retrievalService: RetrievalService,
    private readonly openAiService: OpenAiService,
  ) {}

  @Post('index')
  async indexFile(
    @Param('projectId') projectId: string,
    @Body() body: { path: string; content: string },
  ) {
    return this.ingestionService.indexFile(projectId, body.path, body.content);
  }

  @Get('search')
  async search(
    @Param('projectId') projectId: string,
    @Query('q') query: string,
  ) {
    if (!query) return [];
    return this.retrievalService.query(projectId, query);
  }

  @Post('chat')
  async chat(
    @Param('projectId') projectId: string,
    @Body() body: { messages: Array<{ role: string; content: string }> },
    @Res() res: Response,
  ) {
    const lastMessage = body.messages[body.messages.length - 1];
    const userQuery = lastMessage.content;

    const contextSegments = await this.retrievalService.query(
      projectId,
      userQuery,
    );
    const contextText = (contextSegments as any[])
      .map((s: { content: string }) => s.content)
      .join('\n\n');

    const systemPrompt = `You are Zenith AI, a helpful project assistant.
Use the following context to answer the user's question about the project.
If the answer is not in the context, say so, but try to be helpful.

Context:
${contextText}
`;

    const stream = await this.openAiService.streamText(
      `${systemPrompt}\n\nUser: ${userQuery}`,
    );

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of stream) {
      const chunkData = chunk as { choices: { delta: { content: string } }[] };
      const content = chunkData.choices[0]?.delta?.content || '';
      if (content) {
        res.write(content);
      }
    }
    res.end();
  }
}
