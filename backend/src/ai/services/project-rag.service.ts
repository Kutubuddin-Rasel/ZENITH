import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  SemanticSearchService,
  SemanticSearchResult,
} from './semantic-search.service';
import { AIProviderService } from './ai-provider.service';
import { TenantContext } from '../../core/tenant/tenant-context.service';

/**
 * RAG context containing retrieved issues
 */
export interface RAGContext {
  issues: Array<{
    id: string;
    title: string;
    description: string | null;
    relevance: number;
  }>;
  totalRetrieved: number;
}

/**
 * Response from the RAG chat
 */
export interface ProjectChatResponse {
  answer: string;
  sources: Array<{
    issueId: string;
    title: string;
    relevance: number; // Percentage (0-100)
  }>;
  conversationId: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Stored conversation for multi-turn chat
 */
interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/**
 * ProjectRAGService
 *
 * Provides "Ask Your Project" functionality using Retrieval-Augmented Generation.
 * Flow: User Question → Semantic Search → Context Building → LLM → Answer
 *
 * SECURITY: All data retrieval is strictly scoped to the user's organization
 * via TenantContext to ensure complete tenant isolation.
 */
@Injectable()
export class ProjectRAGService {
  private readonly logger = new Logger(ProjectRAGService.name);

  // Maximum tokens for context (leave room for system prompt and answer)
  private readonly MAX_CONTEXT_TOKENS = 3500;
  private readonly MAX_CONTEXT_ISSUES = 10;

  // In-memory conversation store (in production, use Redis)
  private conversations = new Map<string, ConversationMessage[]>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly semanticSearch: SemanticSearchService,
    private readonly aiProvider: AIProviderService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Ask a question about a project and get an AI-generated answer
   *
   * @param projectId - The project to query
   * @param question - The user's natural language question
   * @param conversationId - Optional conversation ID for multi-turn chat
   * @returns AI-generated answer with source citations
   */
  async askProject(
    projectId: string,
    question: string,
    conversationId?: string,
  ): Promise<ProjectChatResponse> {
    const organizationId = this.tenantContext.getTenantId();

    // SECURITY: Strict tenant isolation check
    if (!organizationId) {
      throw new ForbiddenException(
        'Tenant context required for project intelligence',
      );
    }

    // Verify user has access to this project (belongs to their org)
    const projectAccess = await this.verifyProjectAccess(
      projectId,
      organizationId,
    );
    if (!projectAccess) {
      throw new NotFoundException('Project not found');
    }

    // Generate or use existing conversation ID
    const convId = conversationId || this.generateConversationId();

    // Step 1: Retrieve relevant issues via semantic search
    this.logger.debug(`RAG query for project ${projectId}: "${question}"`);

    const relevantIssues = await this.semanticSearch.searchIssues(question, {
      projectId,
      limit: this.MAX_CONTEXT_ISSUES,
      minSimilarity: 0.35, // Lower threshold for recall
    });

    // Handle no results case
    if (relevantIssues.length === 0) {
      return {
        answer: this.getNoResultsResponse(question),
        sources: [],
        conversationId: convId,
        confidence: 'low',
      };
    }

    // Step 2: Build context from retrieved issues
    const context = this.buildContext(relevantIssues);

    // Step 3: Get conversation history (if multi-turn)
    const history = this.conversations.get(convId) || [];

    // Step 4: Generate answer using LLM
    const { answer, confidence } = await this.generateAnswer(
      question,
      context,
      history,
      projectAccess.projectName,
    );

    // Step 5: Store conversation for future turns
    this.storeConversation(convId, question, answer);

    // Step 6: Return answer with sources
    return {
      answer,
      sources: relevantIssues.slice(0, 5).map((issue) => ({
        issueId: issue.id,
        title: issue.title,
        relevance: Math.round(issue.similarity * 100),
      })),
      conversationId: convId,
      confidence,
    };
  }

  /**
   * Verify the project belongs to the user's organization
   */
  private async verifyProjectAccess(
    projectId: string,
    organizationId: string,
  ): Promise<{ projectName: string } | null> {
    interface ProjectResult {
      name: string;
    }
    const result: ProjectResult[] = await this.dataSource.query(
      `SELECT name FROM projects WHERE id = $1 AND "organizationId" = $2`,
      [projectId, organizationId],
    );

    if (result.length === 0) {
      return null;
    }

    return { projectName: result[0].name };
  }

  /**
   * Build context string from retrieved issues
   */
  private buildContext(issues: SemanticSearchResult[]): RAGContext {
    const contextIssues: RAGContext['issues'] = [];
    let tokenEstimate = 0;

    for (const issue of issues) {
      // Estimate tokens (rough: 1 token ≈ 4 chars)
      const issueText = `${issue.title}\n${issue.description || ''}`;
      const issueTokens = issueText.length / 4;

      if (tokenEstimate + issueTokens > this.MAX_CONTEXT_TOKENS) {
        break;
      }

      contextIssues.push({
        id: issue.id,
        title: issue.title,
        description: issue.description,
        relevance: issue.similarity,
      });

      tokenEstimate += issueTokens;
    }

    return {
      issues: contextIssues,
      totalRetrieved: issues.length,
    };
  }

  /**
   * Generate an answer using the LLM with RAG context
   */
  private async generateAnswer(
    question: string,
    context: RAGContext,
    history: ConversationMessage[],
    projectName: string,
  ): Promise<{ answer: string; confidence: 'high' | 'medium' | 'low' }> {
    // Build system prompt
    const systemPrompt = `You are a helpful project assistant for "${projectName}". 
Your role is to answer questions about the project based ONLY on the provided issue context.

CRITICAL RULES:
1. Only answer based on the information in the provided issues
2. If the context doesn't contain enough information, clearly say so
3. Reference specific issues by their title when relevant
4. Be concise and actionable
5. If asked about something not in the context, say you don't have that information

You have access to ${context.issues.length} relevant issues from the project.`;

    // Build context string
    let contextString = 'RELEVANT ISSUES:\n\n';
    for (const issue of context.issues) {
      contextString += `---\nIssue: ${issue.title}\nDescription: ${issue.description || 'No description'}\n`;
    }

    // Build conversation history
    let historyString = '';
    if (history.length > 0) {
      historyString = '\nPREVIOUS CONVERSATION:\n';
      for (const msg of history.slice(-4)) {
        // Last 4 messages
        historyString += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
      }
    }

    // Build user prompt
    const userPrompt = `${contextString}${historyString}
---
CURRENT QUESTION: ${question}

Provide a helpful answer based on the context above. Be specific and reference relevant issues.`;

    // Generate response using AI provider
    const response = await this.aiProvider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const answer = response.content;

    // Determine confidence based on context quality
    const avgRelevance =
      context.issues.reduce((sum, i) => sum + i.relevance, 0) /
      context.issues.length;

    let confidence: 'high' | 'medium' | 'low';
    if (context.issues.length >= 3 && avgRelevance > 0.6) {
      confidence = 'high';
    } else if (context.issues.length >= 1 && avgRelevance > 0.45) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return { answer, confidence };
  }

  /**
   * Store conversation message for multi-turn context
   */
  private storeConversation(
    conversationId: string,
    question: string,
    answer: string,
  ): void {
    const messages = this.conversations.get(conversationId) || [];

    messages.push(
      { role: 'user', content: question, timestamp: new Date() },
      { role: 'assistant', content: answer, timestamp: new Date() },
    );

    // Keep only last 10 messages
    if (messages.length > 10) {
      messages.splice(0, messages.length - 10);
    }

    this.conversations.set(conversationId, messages);

    // Clean up old conversations (older than 1 hour)
    this.cleanupOldConversations();
  }

  /**
   * Remove conversations older than 1 hour
   */
  private cleanupOldConversations(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    for (const [convId, messages] of this.conversations.entries()) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.timestamp < oneHourAgo) {
        this.conversations.delete(convId);
      }
    }
  }

  /**
   * Generate a unique conversation ID
   */
  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Response when no relevant issues are found
   */
  private getNoResultsResponse(question: string): string {
    return `I couldn't find any relevant issues in this project that match your question: "${question}".

This could mean:
- The topic hasn't been documented in any issues yet
- The question might need to be rephrased
- The relevant issues haven't been indexed for semantic search yet

Try asking about specific features, bugs, or tasks that have been logged as issues in this project.`;
  }

  /**
   * Clear a conversation's history
   */
  clearConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  /**
   * Get suggested questions for a project
   * Based on recent issues and common patterns
   */
  async getSuggestedQuestions(projectId: string): Promise<string[]> {
    const organizationId = this.tenantContext.getTenantId();
    if (!organizationId) return [];

    try {
      interface IssueRow {
        title: string;
        status: string;
      }
      // Get recent issues for context
      const recentIssues: IssueRow[] = await this.dataSource.query(
        `
        SELECT i.title, i.status
        FROM issues i
        INNER JOIN projects p ON i."projectId" = p.id
        WHERE p.id = $1 AND p."organizationId" = $2
        ORDER BY i."createdAt" DESC
        LIMIT 10
        `,
        [projectId, organizationId],
      );

      if (recentIssues.length === 0) {
        return [
          'What are the main features being worked on?',
          'What bugs are currently open?',
          'What was completed recently?',
        ];
      }

      // Generate suggestions based on issue statuses
      const suggestions: string[] = [];
      const hasInProgress = recentIssues.some((i) =>
        i.status.toLowerCase().includes('progress'),
      );
      const hasBugs = recentIssues.some(
        (i) =>
          i.title.toLowerCase().includes('bug') ||
          i.title.toLowerCase().includes('fix'),
      );

      if (hasInProgress) {
        suggestions.push('What work is currently in progress?');
      }
      if (hasBugs) {
        suggestions.push('What bugs need to be fixed?');
      }
      suggestions.push('What are the high priority items?');
      suggestions.push('Summarize recent changes to the project');

      return suggestions.slice(0, 4);
    } catch (error) {
      this.logger.error('Failed to get suggested questions:', error);
      return [];
    }
  }
}
