import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Issue, IssuePriority } from '../../issues/entities/issue.entity';
import { OpenAiService } from '../services/openai.service';
import { EmbeddingsService } from '../services/embeddings.service';
import { SuggestionsService } from '../services/suggestions.service';
import {
  AIPrediction,
  TriageAnalysisResponse,
} from '../interfaces/ai-prediction.interface';

/**
 * Triage Worker with Confidence Scoring
 * - Confidence >= 0.95: Auto-apply changes
 * - Confidence 0.75-0.95: Create suggestion for user review
 * - Confidence < 0.75: Discard prediction
 */
@Processor('ai-triage')
export class TriageWorker extends WorkerHost {
  private readonly logger = new Logger(TriageWorker.name);

  private readonly priorityMap: Record<string, IssuePriority> = {
    Highest: IssuePriority.HIGHEST,
    High: IssuePriority.HIGH,
    Medium: IssuePriority.MEDIUM,
    Low: IssuePriority.LOW,
    Lowest: IssuePriority.LOWEST,
  };

  constructor(
    @InjectRepository(Issue) private issueRepo: Repository<Issue>,
    private openAiService: OpenAiService,
    private embeddingsService: EmbeddingsService,
    private suggestionsService: SuggestionsService,
  ) {
    super();
  }

  async process(job: Job<{ issueId: string }>): Promise<void> {
    const { issueId } = job.data;
    const startTime = Date.now();
    this.logger.log(`Processing triage for issue ${issueId}`);

    const issue = await this.issueRepo.findOne({ where: { id: issueId } });
    if (!issue) {
      this.logger.warn(`Issue ${issueId} not found`);
      return;
    }

    if (!issue.title && !issue.description) {
      this.logger.warn('Issue has no content to analyze');
      return;
    }

    const textToAnalyze = `${issue.title}\n${issue.description || ''}`;

    try {
      // 1. Generate Embedding for Deduplication (and future RAG)
      const embedding = await this.embeddingsService.create(textToAnalyze);
      if (embedding && embedding.length > 0) {
        issue.embedding = embedding;
      }

      // 2. Classification via LLM with confidence scoring
      const prediction = await this.classifyWithConfidence(issue);

      if (!prediction) {
        this.logger.warn(`No prediction generated for issue ${issueId}`);
        await this.issueRepo.save(issue); // Save embedding at least
        return;
      }

      // 3. Determine action based on confidence
      const action = SuggestionsService.determineAction(prediction.confidence);
      const latencyMs = Date.now() - startTime;

      this.logger.log(
        `Issue ${issueId}: confidence=${prediction.confidence.toFixed(2)}, action=${action}`,
      );

      switch (action) {
        case 'auto_apply':
          await this.autoApply(issue, prediction);
          break;

        case 'suggest':
          await this.suggestionsService.create({
            issueId,
            prediction: { ...prediction, model: 'gpt-3.5-turbo' },
            expiresInHours: 24,
          });
          // Still save embedding
          await this.issueRepo.save(issue);
          break;

        case 'discard':
          this.logger.log(
            `Discarding low-confidence prediction for issue ${issueId}`,
          );
          // Save embedding only
          await this.issueRepo.save(issue);
          break;
      }

      this.logger.log(
        `Triaged issue ${issueId} in ${latencyMs}ms: action=${action}`,
      );
    } catch (error) {
      this.logger.error(`Triage failed for issue ${issueId}`, error);
      throw error; // Trigger BullMQ retry
    }
  }

  /**
   * Classify issue with LLM and extract confidence score
   */
  private async classifyWithConfidence(
    issue: Issue,
  ): Promise<AIPrediction | null> {
    const prompt = `You are a project management AI assistant.
Analyze the following issue and predict:
1. Priority (Highest, High, Medium, Low, Lowest)
2. Labels (array) - e.g. ["Bug", "Feature", "Documentation", "UI/UX", "Backend"]
3. Confidence (0.0-1.0) - how confident you are in this prediction
4. Reasoning - brief explanation for your prediction

Issue Title: ${issue.title}
Issue Description: ${issue.description || 'No description'}

IMPORTANT: Return ONLY valid JSON in this exact format:
{
  "priority": "High",
  "labels": ["Bug", "Backend"],
  "confidence": 0.85,
  "reasoning": "The title mentions 'error' suggesting a bug..."
}`;

    const response = await this.openAiService.generateText(
      prompt,
      'gpt-3.5-turbo',
    );

    if (!response) {
      return null;
    }

    try {
      // Cleanup code fences if any
      const jsonStr = response
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const analysis = JSON.parse(jsonStr) as TriageAnalysisResponse;

      // Validate and normalize
      const priority = this.priorityMap[analysis.priority];
      const confidence = Math.min(
        1,
        Math.max(0, Number(analysis.confidence) || 0.5),
      );

      return {
        priority,
        labels: Array.isArray(analysis.labels) ? analysis.labels : [],
        confidence,
        reasoning: analysis.reasoning || '',
        model: 'gpt-3.5-turbo',
      };
    } catch (e) {
      this.logger.warn('Failed to parse LLM response', e);
      return null;
    }
  }

  /**
   * Auto-apply high-confidence predictions directly to issue
   */
  private async autoApply(
    issue: Issue,
    prediction: AIPrediction,
  ): Promise<void> {
    if (prediction.priority) {
      issue.priority = prediction.priority;
    }

    if (prediction.labels && prediction.labels.length > 0) {
      const existingLabels = issue.labels || [];
      const newLabels = prediction.labels.filter(
        (l) => !existingLabels.includes(l),
      );
      issue.labels = [...existingLabels, ...newLabels];
    }

    await this.issueRepo.save(issue);

    this.logger.log(
      `Auto-applied prediction to issue ${issue.id}: Priority=${issue.priority}, Labels=${issue.labels?.join(',')}`,
    );
  }
}
