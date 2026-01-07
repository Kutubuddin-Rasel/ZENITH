import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ProjectRoleGuard } from '../../auth/guards/project-role.guard';
import { RequireProjectRole } from '../../auth/decorators/require-project-role.decorator';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import {
  ProjectRAGService,
  ProjectChatResponse,
} from '../services/project-rag.service';
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

/**
 * DTO for asking a question about a project
 */
class AskProjectDto {
  @IsString()
  @MinLength(3, { message: 'Question must be at least 3 characters' })
  @MaxLength(1000, { message: 'Question must be at most 1000 characters' })
  question: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}

/**
 * ProjectChatController
 *
 * Provides "Ask Your Project" AI-powered chat functionality.
 * Uses RAG (Retrieval-Augmented Generation) to answer questions
 * about a project based on its issues and content.
 *
 * All endpoints require authentication and project membership.
 */
@ApiTags('AI - Project Intelligence')
@ApiBearerAuth()
@Controller('projects/:projectId/chat')
@UseGuards(JwtAuthGuard, ProjectRoleGuard)
export class ProjectChatController {
  constructor(private readonly ragService: ProjectRAGService) {}

  /**
   * Ask a question about the project
   *
   * Uses semantic search to find relevant issues and generates
   * an AI-powered answer with source citations.
   */
  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ask a question about the project',
    description:
      'Uses AI to answer questions about the project based on its issues and content',
  })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @ApiResponse({
    status: 200,
    description: 'AI-generated answer with source citations',
  })
  @ApiResponse({ status: 403, description: 'Not a project member' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @RequireProjectRole(
    ProjectRole.VIEWER,
    ProjectRole.GUEST,
    ProjectRole.DEVELOPER,
    ProjectRole.DESIGNER,
    ProjectRole.QA,
    ProjectRole.PROJECT_LEAD,
  )
  async askProject(
    @Param('projectId') projectId: string,
    @Body() dto: AskProjectDto,
  ): Promise<ProjectChatResponse> {
    return this.ragService.askProject(
      projectId,
      dto.question,
      dto.conversationId,
    );
  }

  /**
   * Get suggested questions for the project
   *
   * Returns a list of suggested questions based on
   * recent issues and project activity.
   */
  @Get('suggestions')
  @ApiOperation({
    summary: 'Get suggested questions',
    description: 'Returns suggested questions based on project content',
  })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @RequireProjectRole(
    ProjectRole.VIEWER,
    ProjectRole.GUEST,
    ProjectRole.DEVELOPER,
    ProjectRole.DESIGNER,
    ProjectRole.QA,
    ProjectRole.PROJECT_LEAD,
  )
  async getSuggestions(
    @Param('projectId') projectId: string,
  ): Promise<{ suggestions: string[] }> {
    const suggestions = await this.ragService.getSuggestedQuestions(projectId);
    return { suggestions };
  }

  /**
   * Clear a conversation's history
   *
   * Removes the stored conversation context to start fresh.
   */
  @Delete('conversations/:conversationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Clear conversation history',
    description: 'Removes conversation context to start a new chat',
  })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  @RequireProjectRole(
    ProjectRole.VIEWER,
    ProjectRole.DEVELOPER,
    ProjectRole.PROJECT_LEAD,
  )
  clearConversation(@Param('conversationId') conversationId: string): void {
    this.ragService.clearConversation(conversationId);
  }
}
