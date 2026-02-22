/**
 * Project Generation Processor (BullMQ Consumer)
 *
 * Consumes jobs from the 'project-generation' queue, calls the LLM to parse
 * unstructured text, validates the response with Zod, and executes an
 * all-or-nothing database transaction to create the Project + Epics + Issues.
 *
 * ARCHITECTURE (per micro-use-queues, arch-single-responsibility):
 *   Controller → Producer (enqueue) → THIS PROCESSOR (consume + transact)
 *
 * DEEP THINKING — TRANSACTION ISOLATION:
 * ──────────────────────────────────────
 * PostgreSQL default isolation level: READ COMMITTED
 *
 * Q: Can two concurrent jobs suffer from read-phenomena?
 * A: The issueCounter is safe — each job creates a NEW project, so no other
 *    job inserts issues for the same projectId. The key generation could
 *    theoretically race: two jobs check for "ECOM" simultaneously, both find
 *    it available, then one commits and the other gets a UNIQUE constraint
 *    violation on Project.key. This is handled by:
 *    1. The try/catch block rolls back the entire transaction
 *    2. BullMQ retries the job with exponential backoff
 *    3. On retry, generateUniqueKey() finds "ECOM" taken and produces "ECOM1"
 *
 * DEEP THINKING — LLM JSON PARSING:
 * ──────────────────────────────────
 * LLMs occasionally wrap JSON in markdown code fences:
 *   ```json\n{...}\n```
 * The sanitizeJsonResponse() method strips these fences before JSON.parse().
 * It handles: ```json, ```, and leading/trailing whitespace.
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DataSource, Repository } from 'typeorm';

import { AIProviderService } from '../../ai/services/ai-provider.service';
import { BoardGateway } from '../../gateways/board.gateway';
import { Project } from '../entities/project.entity';
import {
  Issue,
  IssueType,
  IssuePriority,
} from '../../issues/entities/issue.entity';
import {
  GeneratedProjectSchema,
  GeneratedProject,
} from '../schemas/generated-project.schema';
import { ProjectGenerationJobData } from '../dto/generate-project-from-text.dto';
import { PROJECT_GENERATION_QUEUE } from '../projects.module';

/**
 * Result emitted to the frontend via WebSocket after successful generation.
 */
interface ProjectGenerationResult {
  projectId: string;
  projectName: string;
  projectKey: string;
  epicCount: number;
  issueCount: number;
}

@Processor(PROJECT_GENERATION_QUEUE)
export class ProjectGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ProjectGenerationProcessor.name);
  private readonly projectRepo: Repository<Project>;

  constructor(
    private readonly dataSource: DataSource,
    private readonly aiProvider: AIProviderService,
    private readonly boardGateway: BoardGateway,
  ) {
    super();
    this.projectRepo = this.dataSource.getRepository(Project);
  }

  /**
   * BullMQ entry point. Called for each job in the 'project-generation' queue.
   *
   * Flow: LLM call → Zod validation → Key generation → DB transaction → WS notify
   */
  async process(
    job: Job<ProjectGenerationJobData>,
  ): Promise<ProjectGenerationResult> {
    const { rawText, methodologyHint, userId, organizationId } = job.data;

    this.logger.log(
      `Processing project generation job ${job.id} for user ${userId}`,
    );

    // ──────────────────────────────────────────
    // STEP 1: Call the LLM with structured prompt
    // ──────────────────────────────────────────
    const systemPrompt = this.buildSystemPrompt(methodologyHint);
    const response = await this.aiProvider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: rawText },
      ],
      maxTokens: 4096,
      responseFormat: 'json',
    });

    this.logger.debug(
      `LLM responded in ${response.latencyMs}ms via ${response.provider}`,
    );

    // ──────────────────────────────────────────
    // STEP 2: Sanitize & parse the LLM response
    // ──────────────────────────────────────────
    const sanitized = this.sanitizeJsonResponse(response.content);
    let rawJson: unknown;

    try {
      rawJson = JSON.parse(sanitized);
    } catch (parseError: unknown) {
      const message =
        parseError instanceof Error
          ? parseError.message
          : 'Unknown parse error';
      throw new Error(
        `LLM returned invalid JSON: ${message}. Raw response (first 500 chars): ${response.content.substring(0, 500)}`,
      );
    }

    // ──────────────────────────────────────────
    // STEP 3: Validate with Zod
    // ──────────────────────────────────────────
    const parseResult = GeneratedProjectSchema.safeParse(rawJson);

    if (!parseResult.success) {
      const formattedErrors = parseResult.error.issues
        .map((issue) => `  [${issue.path.join('.')}]: ${issue.message}`)
        .join('\n');

      throw new Error(
        `LLM output failed schema validation:\n${formattedErrors}`,
      );
    }

    const parsed: GeneratedProject = parseResult.data;

    this.logger.log(
      `LLM generated: "${parsed.projectName}" with ${parsed.epics.length} epics, ` +
        `${parsed.epics.reduce((sum, e) => sum + e.issues.length, 0)} issues`,
    );

    // ──────────────────────────────────────────
    // STEP 4: Generate unique project key (BEFORE transaction)
    // ──────────────────────────────────────────
    const projectKey = await this.generateUniqueKey(parsed.projectName);

    // ──────────────────────────────────────────
    // STEP 5: Database transaction (all-or-nothing)
    // ──────────────────────────────────────────
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    /**
     * MONOTONIC COUNTER (Fix 2 from architectural review):
     * Single counter for ALL issues (Epics + children).
     * Epics and child Issues share the projectId numbering space.
     * Prevents UNIQUE constraint violation on ['projectId', 'number'].
     */
    let issueCounter = 1;
    let savedProject: Project;
    let totalIssueCount = 0;

    try {
      // STEP 5A: Insert Project
      const project = queryRunner.manager.create(Project, {
        name: parsed.projectName,
        key: projectKey,
        description: parsed.description,
        organizationId: organizationId,
      });
      savedProject = await queryRunner.manager.save(project);

      // STEP 5B: Insert Epics (Issues with type='Epic')
      for (const epic of parsed.epics) {
        const epicIssue = queryRunner.manager.create(Issue, {
          projectId: savedProject.id,
          title: epic.title,
          description: epic.description,
          type: IssueType.EPIC,
          priority: IssuePriority.MEDIUM,
          reporterId: userId,
          status: 'Backlog',
          number: issueCounter++,
        });
        const savedEpic = await queryRunner.manager.save(epicIssue);

        // STEP 5C: Insert child Issues under this Epic
        for (const issue of epic.issues) {
          const childIssue = queryRunner.manager.create(Issue, {
            projectId: savedProject.id,
            parentId: savedEpic.id,
            title: issue.title,
            description: issue.description,
            type: issue.type as IssueType,
            priority: issue.priority as IssuePriority,
            storyPoints: issue.storyPoints,
            labels: issue.labels,
            reporterId: userId,
            status: 'Backlog',
            number: issueCounter++,
          });
          await queryRunner.manager.save(childIssue);
          totalIssueCount++;
        }
      }

      await queryRunner.commitTransaction();

      this.logger.log(
        `✅ Project "${savedProject.name}" (${projectKey}) created with ` +
          `${parsed.epics.length} epics and ${totalIssueCount} issues`,
      );
    } catch (txError: unknown) {
      await queryRunner.rollbackTransaction();

      const message =
        txError instanceof Error
          ? txError.message
          : 'Unknown transaction error';
      this.logger.error(
        `❌ Transaction rolled back for job ${job.id}: ${message}`,
      );
      throw txError; // Re-throw so BullMQ registers the failure
    } finally {
      await queryRunner.release();
    }

    // ──────────────────────────────────────────
    // STEP 6: WebSocket notification to the requesting user
    // ──────────────────────────────────────────
    const result: ProjectGenerationResult = {
      projectId: savedProject.id,
      projectName: savedProject.name,
      projectKey: projectKey,
      epicCount: parsed.epics.length,
      issueCount: totalIssueCount,
    };

    this.boardGateway.server.to(userId).emit('project:generated', result);

    this.logger.log(`📡 Emitted project:generated to user ${userId}`);

    return result;
  }

  // ============================================================
  // PRIVATE METHODS
  // ============================================================

  /**
   * Build the system prompt for the LLM.
   *
   * SECURITY — PROMPT INJECTION DEFENSE:
   * The user's raw text is passed as a separate `user` message,
   * NEVER injected into this system prompt. Even if the user text
   * says "ignore all instructions", it cannot override the system role.
   */
  private buildSystemPrompt(methodologyHint?: string): string {
    const methodologyInstruction = methodologyHint
      ? `The user prefers the "${methodologyHint}" methodology. Use it if appropriate.`
      : 'Infer the most appropriate methodology from the text.';

    return `You are a senior project management expert. Your task is to analyze the provided text and generate a structured project plan.

OUTPUT FORMAT:
You MUST respond with valid JSON matching EXACTLY this structure:
{
  "projectName": "string (2-100 chars)",
  "description": "string (optional, max 2000 chars)",
  "methodology": "agile" | "scrum" | "kanban" | "waterfall" | "hybrid" | "lean",
  "epics": [
    {
      "title": "string (3-255 chars)",
      "description": "string (optional, max 2000 chars)",
      "issues": [
        {
          "title": "string (3-255 chars)",
          "description": "string (optional, max 2000 chars)",
          "type": "Story" | "Task" | "Bug" | "Sub-task",
          "priority": "Highest" | "High" | "Medium" | "Low" | "Lowest",
          "storyPoints": number (0-21, Fibonacci scale),
          "labels": ["string"] (max 5 labels)
        }
      ]
    }
  ]
}

CONSTRAINTS:
- Generate at most 4 epics
- Generate at most 7 issues per epic
- ${methodologyInstruction}
- Do NOT include any text outside the JSON object
- Do NOT wrap the JSON in markdown code fences
- If the text is vague, make reasonable assumptions for a software project
- Assign realistic story points using Fibonacci scale (1, 2, 3, 5, 8, 13, 21)
- Set priority based on business impact inferred from the text`;
  }

  /**
   * Sanitize LLM response by stripping markdown code fences.
   *
   * DEEP THINKING — LLM JSON PARSING:
   * LLMs occasionally wrap their JSON in code fences like:
   *   \`\`\`json\n{...}\n\`\`\`
   * or just:
   *   \`\`\`\n{...}\n\`\`\`
   *
   * This method strips those fences to produce clean JSON for JSON.parse().
   */
  private sanitizeJsonResponse(raw: string): string {
    let cleaned = raw.trim();

    // Strip opening code fence: ```json or ``` (with optional language tag)
    if (cleaned.startsWith('```')) {
      const firstNewline = cleaned.indexOf('\n');
      if (firstNewline !== -1) {
        cleaned = cleaned.substring(firstNewline + 1);
      }
    }

    // Strip closing code fence: ```
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }

    return cleaned.trim();
  }

  /**
   * Generate a unique project key from the project name.
   *
   * Logic:
   *   1. Strip non-alpha characters
   *   2. Uppercase and take first 4 letters
   *   3. Fallback to "PROJ" if name has no alpha chars
   *   4. Check global uniqueness (Project.key is @Unique globally)
   *   5. Append numeric suffix if collision exists
   *
   * DEEP THINKING — RACE CONDITION:
   * Two concurrent jobs could both find "ECOM" available.
   * If one commits first, the other gets a UNIQUE constraint violation.
   * That job's transaction rolls back and BullMQ retries it.
   * On retry, generateUniqueKey() finds "ECOM" taken and produces "ECOM1".
   *
   * This is run BEFORE the transaction to minimize time inside the txn.
   */
  private async generateUniqueKey(projectName: string): Promise<string> {
    const alphaOnly = projectName.replace(/[^a-zA-Z]/g, '');
    const base = alphaOnly.substring(0, 4).toUpperCase() || 'PROJ';
    let candidate = base;
    let suffix = 1;

    while (await this.projectRepo.findOne({ where: { key: candidate } })) {
      candidate = `${base}${suffix}`;
      suffix++;
    }

    return candidate;
  }
}
