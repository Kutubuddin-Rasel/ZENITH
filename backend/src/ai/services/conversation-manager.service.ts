/**
 * Conversation Manager Service
 * Manages conversation state with Redis for Smart Setup AI
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CacheService } from '../../cache/cache.service';
import {
  ConversationContext,
  IntelligentCriteria,
  CriteriaConfidence,
  createEmptyCriteria,
  createEmptyConfidence,
  REQUIRED_CRITERIA,
} from '../interfaces/intelligent-criteria.interface';

/**
 * Configuration for conversation management
 */
const CONVERSATION_CONFIG = {
  TTL_SECONDS: 1800, // 30 minutes
  NAMESPACE: 'smart-setup',
  KEY_PREFIX: 'conversation',
};

@Injectable()
export class ConversationManagerService {
  private readonly logger = new Logger(ConversationManagerService.name);

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Get or create a conversation context
   */
  async getOrCreateContext(
    conversationId: string | undefined,
    userId: string,
  ): Promise<ConversationContext> {
    // Try to get existing context
    if (conversationId) {
      try {
        const existing = await this.getContext(conversationId);
        if (existing && existing.userId === userId) {
          return existing;
        }
        // Different user or expired - create new
        if (existing) {
          this.logger.warn(
            `Context ${conversationId} belongs to different user, creating new`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to retrieve context ${conversationId}, creating new`,
          error,
        );
      }
    }

    // Create and persist new context
    return this.createAndSaveContext(userId);
  }

  /**
   * Create a new conversation context and save to Redis
   */
  private async createAndSaveContext(
    userId: string,
  ): Promise<ConversationContext> {
    const now = new Date();
    const context: ConversationContext = {
      id: uuidv4(),
      userId,
      createdAt: now,
      expiresAt: new Date(
        now.getTime() + CONVERSATION_CONFIG.TTL_SECONDS * 1000,
      ),
      messages: [],
      criteria: createEmptyCriteria(),
      confidence: createEmptyConfidence(),
      askedQuestions: [],
      corrections: [],
      turnCount: 0,
      lastActivityAt: now,
    };

    // CRITICAL: Persist to Redis immediately
    const saved = await this.saveContext(context);
    if (!saved) {
      this.logger.error(
        `Failed to save new conversation context to Redis: ${context.id}`,
      );
      // Still return context so it can be used in-memory for this request
    } else {
      this.logger.debug(
        `Created and saved new conversation context: ${context.id}`,
      );
    }

    return context;
  }

  /**
   * Get existing conversation context from Redis
   */
  async getContext(
    conversationId: string,
  ): Promise<ConversationContext | null> {
    try {
      const context = await this.cacheService.get<ConversationContext>(
        `${CONVERSATION_CONFIG.KEY_PREFIX}:${conversationId}`,
        { namespace: CONVERSATION_CONFIG.NAMESPACE },
      );

      if (context) {
        this.logger.debug(`Retrieved conversation context: ${conversationId}`);
        // Parse dates that were serialized
        context.createdAt = new Date(context.createdAt);
        context.expiresAt = new Date(context.expiresAt);
        context.lastActivityAt = new Date(context.lastActivityAt);
        context.messages = context.messages.map((m) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
      }

      return context;
    } catch (error) {
      this.logger.warn(
        `Failed to get conversation context: ${conversationId}`,
        error,
      );
      return null;
    }
  }

  /**
   * Save conversation context to Redis
   */
  async saveContext(context: ConversationContext): Promise<boolean> {
    try {
      context.lastActivityAt = new Date();

      const saved = await this.cacheService.set(
        `${CONVERSATION_CONFIG.KEY_PREFIX}:${context.id}`,
        context,
        {
          ttl: CONVERSATION_CONFIG.TTL_SECONDS,
          namespace: CONVERSATION_CONFIG.NAMESPACE,
          tags: ['smart-setup', `user:${context.userId}`],
        },
      );

      this.logger.debug(`Saved conversation context: ${context.id}`);
      return saved;
    } catch (error) {
      this.logger.error(
        `Failed to save conversation context: ${context.id}`,
        error,
      );
      return false;
    }
  }

  /**
   * Add a user message to the conversation
   */
  addUserMessage(context: ConversationContext, content: string): void {
    context.messages.push({
      role: 'user',
      content,
      timestamp: new Date(),
    });
    context.turnCount++;
  }

  /**
   * Add an assistant message to the conversation
   */
  addAssistantMessage(
    context: ConversationContext,
    content: string,
    extractedData?: Partial<IntelligentCriteria>,
  ): void {
    context.messages.push({
      role: 'assistant',
      content,
      timestamp: new Date(),
      extractedData,
    });
  }

  /**
   * Update criteria with new extraction
   */
  updateCriteria(
    context: ConversationContext,
    newCriteria: Partial<IntelligentCriteria>,
    confidence: Partial<CriteriaConfidence>,
  ): void {
    // Merge new criteria, preserving existing values
    for (const [key, value] of Object.entries(newCriteria)) {
      if (value !== null && value !== undefined) {
        const typedKey = key as keyof IntelligentCriteria;
        (context.criteria as unknown as Record<string, unknown>)[typedKey] =
          value;
      }
    }

    // Update confidence scores
    for (const [key, value] of Object.entries(confidence)) {
      if (typeof value === 'number') {
        (context.confidence as unknown as Record<string, number>)[key] = value;
      }
    }

    // Recalculate overall confidence
    context.confidence.overall = this.calculateOverallConfidence(
      context.confidence,
    );
  }

  /**
   * Track that a question was asked
   */
  markQuestionAsked(context: ConversationContext, field: string): void {
    if (!context.askedQuestions.includes(field)) {
      context.askedQuestions.push(field);
    }
  }

  /**
   * Check if a question was already asked
   */
  wasQuestionAsked(context: ConversationContext, field: string): boolean {
    return context.askedQuestions.includes(field);
  }

  /**
   * Record a user correction for learning
   */
  recordCorrection(
    context: ConversationContext,
    field: keyof IntelligentCriteria,
    originalValue: unknown,
    correctedValue: unknown,
  ): void {
    context.corrections.push({
      field,
      originalValue,
      correctedValue,
      timestamp: new Date(),
    });
  }

  /**
   * Get missing required criteria
   */
  getMissingCriteria(
    criteria: IntelligentCriteria,
  ): (keyof IntelligentCriteria)[] {
    return REQUIRED_CRITERIA.filter((field) => {
      const value = criteria[field];
      return value === null || value === undefined;
    });
  }

  /**
   * Check if we have enough criteria for recommendation
   */
  isReadyForRecommendation(criteria: IntelligentCriteria): boolean {
    return this.getMissingCriteria(criteria).length === 0;
  }

  /**
   * Get full conversation as text for AI context
   */
  getConversationText(context: ConversationContext): string {
    return context.messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');
  }

  /**
   * Calculate overall confidence from individual confidence scores
   */
  private calculateOverallConfidence(confidence: CriteriaConfidence): number {
    const weights = {
      projectType: 0.25,
      teamSize: 0.2,
      workStyle: 0.2,
      timeline: 0.1,
      hasExternalStakeholders: 0.15,
      industry: 0.1,
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [key, weight] of Object.entries(weights)) {
      const score = confidence[key as keyof typeof weights];
      if (typeof score === 'number' && score > 0) {
        weightedSum += score * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Delete a conversation context
   */
  async deleteContext(conversationId: string): Promise<boolean> {
    try {
      return await this.cacheService.del(
        `${CONVERSATION_CONFIG.KEY_PREFIX}:${conversationId}`,
        { namespace: CONVERSATION_CONFIG.NAMESPACE },
      );
    } catch (error) {
      this.logger.error(
        `Failed to delete conversation context: ${conversationId}`,
        error,
      );
      return false;
    }
  }
}
