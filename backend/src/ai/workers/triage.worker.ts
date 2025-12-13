import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Issue, IssuePriority } from '../../issues/entities/issue.entity';
import { OpenAiService } from '../services/openai.service';
import { EmbeddingsService } from '../services/embeddings.service';

@Processor('ai-triage')
export class TriageWorker extends WorkerHost {
  private readonly logger = new Logger(TriageWorker.name);

  constructor(
    @InjectRepository(Issue) private issueRepo: Repository<Issue>,
    private openAiService: OpenAiService,
    private embeddingsService: EmbeddingsService,
  ) {
    super();
  }

  async process(job: Job<{ issueId: string }>): Promise<void> {
    const { issueId } = job.data;
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
        // Save embedding - using custom update to handle vector type if necessary
        // TypeORM `save` with float array might work if transformer matches,
        // but here we might need raw SQL IF 'embedding' column type causes mismatch.
        // Let's try standard save first.
        issue.embedding = embedding;
        // Optimization: Save embedding first before LLM call to enable fast search immediately?
        // Or await LLM.
      }

      // 2. Classification via LLM
      const prompt = `
        You are a project management AI assistant.
        Analyze the following issue and predict:
        1. Priority (Highest, High, Medium, Low, Lowest)
        2. Labels (comma separated) - e.g. "Bug", "Feature", "Documentation", "UI/UX", "Backend"
        
        Issue Title: ${issue.title}
        Issue Description: ${issue.description || 'No description'}

        Return JSON format only:
        {
          "priority": "EnumString",
          "labels": ["string"]
        }
      `;

      const response = await this.openAiService.generateText(
        prompt,
        'gpt-3.5-turbo',
      );
      interface TriageAnalysis {
        priority?: 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';
        labels?: string[];
      }
      let analysis: TriageAnalysis = {};

      try {
        // cleanup code fences if any
        const jsonStr = response
          .replace(/```json/g, '')
          .replace(/```/g, '')
          .trim();
        analysis = JSON.parse(jsonStr) as TriageAnalysis;
      } catch (e) {
        this.logger.warn('Failed to parse LLM response', e);
      }

      // 3. Apply changes (Auto-Labeling)
      // Only set if not already set (don't overwrite user explicit choice if we can detect that,
      // but here we just overwrite default or merge).
      // We will only update if priority is Medium (default) to specific?
      // For now, let's aggressively triage.

      if (
        analysis.priority &&
        ['Highest', 'High', 'Medium', 'Low', 'Lowest'].includes(
          analysis.priority,
        )
      ) {
        // Map to enum if needed, assuming exact match
        const priorityMap: Record<string, IssuePriority> = {
          Highest: IssuePriority.HIGHEST,
          High: IssuePriority.HIGH,
          Medium: IssuePriority.MEDIUM,
          Low: IssuePriority.LOW,
          Lowest: IssuePriority.LOWEST,
        };
        issue.priority = priorityMap[analysis.priority] || IssuePriority.MEDIUM;
      }

      if (analysis.labels && Array.isArray(analysis.labels)) {
        const existingLabels = issue.labels || [];
        const newLabels = analysis.labels.filter(
          (l) => !existingLabels.includes(l),
        );
        issue.labels = [...existingLabels, ...newLabels];
      }

      // Save everything
      await this.issueRepo.save(issue);
      this.logger.log(
        `Triaged issue ${issueId}: Priority=${issue.priority}, Labels=${issue.labels?.join(',')}`,
      );
    } catch (error) {
      this.logger.error(`Triage failed for issue ${issueId}`, error);
      throw error; // Trigger BullMQ retry
    }
  }
}
