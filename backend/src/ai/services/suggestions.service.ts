import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { AISuggestion } from '../entities/ai-suggestion.entity';
import { AIPredictionLog } from '../entities/ai-prediction-log.entity';
import {
  AIPrediction,
  AISuggestionStatus,
  ConfidenceThreshold,
} from '../interfaces/ai-prediction.interface';
import { Issue } from '../../issues/entities/issue.entity';

export interface CreateSuggestionDto {
  issueId: string;
  prediction: AIPrediction;
  expiresInHours?: number;
}

@Injectable()
export class SuggestionsService {
  private readonly logger = new Logger(SuggestionsService.name);

  constructor(
    @InjectRepository(AISuggestion)
    private readonly suggestionRepo: Repository<AISuggestion>,
    @InjectRepository(AIPredictionLog)
    private readonly predictionLogRepo: Repository<AIPredictionLog>,
    @InjectRepository(Issue)
    private readonly issueRepo: Repository<Issue>,
  ) {}

  /**
   * Create a new AI suggestion for user review
   */
  async create(dto: CreateSuggestionDto): Promise<AISuggestion> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (dto.expiresInHours || 24));

    const suggestion = this.suggestionRepo.create({
      issueId: dto.issueId,
      prediction: dto.prediction,
      confidence: dto.prediction.confidence,
      status: AISuggestionStatus.PENDING,
      expiresAt,
    });

    const saved = await this.suggestionRepo.save(suggestion);
    this.logger.log(
      `Created AI suggestion ${saved.id} for issue ${dto.issueId} with confidence ${dto.prediction.confidence}`,
    );

    // Log prediction for shadow mode evaluation
    await this.logPrediction(dto.issueId, dto.prediction);

    return saved;
  }

  /**
   * Get pending suggestions for an issue
   */
  async findPendingForIssue(issueId: string): Promise<AISuggestion[]> {
    return this.suggestionRepo.find({
      where: {
        issueId,
        status: AISuggestionStatus.PENDING,
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get all pending suggestions (for inbox/notification)
   */
  async findAllPending(limit = 50): Promise<AISuggestion[]> {
    return this.suggestionRepo.find({
      where: {
        status: AISuggestionStatus.PENDING,
      },
      relations: ['issue'],
      order: { confidence: 'DESC', createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Accept a suggestion and apply changes to the issue
   */
  async accept(
    suggestionId: string,
    userId: string,
  ): Promise<{ suggestion: AISuggestion; issue: Issue }> {
    const suggestion = await this.suggestionRepo.findOne({
      where: { id: suggestionId },
    });

    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }

    const issue = await this.issueRepo.findOne({
      where: { id: suggestion.issueId },
    });

    if (!issue) {
      throw new NotFoundException('Issue not found');
    }

    // Apply prediction to issue
    if (suggestion.prediction.priority) {
      issue.priority = suggestion.prediction.priority;
    }

    if (suggestion.prediction.labels?.length) {
      const existingLabels = issue.labels || [];
      const newLabels = suggestion.prediction.labels.filter(
        (l) => !existingLabels.includes(l),
      );
      issue.labels = [...existingLabels, ...newLabels];
    }

    await this.issueRepo.save(issue);

    // Update suggestion status
    suggestion.status = AISuggestionStatus.ACCEPTED;
    suggestion.reviewedById = userId;
    suggestion.reviewedAt = new Date();
    await this.suggestionRepo.save(suggestion);

    // Log accuracy
    await this.updatePredictionAccuracy(suggestion.issueId, true);

    this.logger.log(`Suggestion ${suggestionId} accepted by user ${userId}`);

    return { suggestion, issue };
  }

  /**
   * Reject a suggestion
   */
  async reject(suggestionId: string, userId: string): Promise<AISuggestion> {
    const suggestion = await this.suggestionRepo.findOne({
      where: { id: suggestionId },
    });

    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }

    suggestion.status = AISuggestionStatus.REJECTED;
    suggestion.reviewedById = userId;
    suggestion.reviewedAt = new Date();

    await this.suggestionRepo.save(suggestion);

    // Log as inaccurate
    await this.updatePredictionAccuracy(suggestion.issueId, false);

    this.logger.log(`Suggestion ${suggestionId} rejected by user ${userId}`);

    return suggestion;
  }

  /**
   * Expire old suggestions (called by cron job)
   */
  async expireOldSuggestions(): Promise<number> {
    const result = await this.suggestionRepo.update(
      {
        status: AISuggestionStatus.PENDING,
        expiresAt: LessThan(new Date()),
      },
      { status: AISuggestionStatus.EXPIRED },
    );

    if (result.affected && result.affected > 0) {
      this.logger.log(`Expired ${result.affected} old AI suggestions`);
    }

    return result.affected || 0;
  }

  /**
   * Log prediction for shadow mode evaluation
   */
  private async logPrediction(
    issueId: string,
    prediction: AIPrediction,
  ): Promise<void> {
    const log = this.predictionLogRepo.create({
      issueId,
      prediction,
      model: prediction.model || 'gpt-3.5-turbo',
    });

    await this.predictionLogRepo.save(log);
  }

  /**
   * Update prediction accuracy after user review
   */
  private async updatePredictionAccuracy(
    issueId: string,
    wasAccurate: boolean,
  ): Promise<void> {
    const issue = await this.issueRepo.findOne({ where: { id: issueId } });

    if (!issue) return;

    // Find the most recent prediction log for this issue
    const logs = await this.predictionLogRepo.find({
      where: { issueId },
      order: { createdAt: 'DESC' },
      take: 1,
    });

    if (logs.length > 0) {
      const log = logs[0];
      log.wasAccurate = wasAccurate;
      log.actualOutcome = {
        priority: issue.priority,
        labels: issue.labels || [],
      };
      await this.predictionLogRepo.save(log);
    }
  }

  /**
   * Get prediction accuracy stats
   */
  async getAccuracyStats(): Promise<{
    total: number;
    accurate: number;
    inaccurate: number;
    accuracyRate: number;
  }> {
    const total = await this.predictionLogRepo.count({
      where: { wasAccurate: undefined },
    });

    const accurate = await this.predictionLogRepo.count({
      where: { wasAccurate: true },
    });

    const inaccurate = await this.predictionLogRepo.count({
      where: { wasAccurate: false },
    });

    const evaluated = accurate + inaccurate;
    const accuracyRate = evaluated > 0 ? accurate / evaluated : 0;

    return { total, accurate, inaccurate, accuracyRate };
  }

  /**
   * Determine action based on confidence level
   */
  static determineAction(
    confidence: number,
  ): 'auto_apply' | 'suggest' | 'discard' {
    if (confidence >= Number(ConfidenceThreshold.AUTO_APPLY)) {
      return 'auto_apply';
    }
    if (confidence >= Number(ConfidenceThreshold.SUGGEST)) {
      return 'suggest';
    }
    return 'discard';
  }
}
