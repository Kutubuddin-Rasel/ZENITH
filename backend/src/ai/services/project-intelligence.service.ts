import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AIProviderService } from './ai-provider.service';
import { CacheService } from '../../cache/cache.service';
import {
  ProjectTemplate,
  ProjectCategory,
  ProjectMethodology,
} from '../../project-templates/entities/project-template.entity';
import {
  ProjectRecommendationRequest,
  ProjectRecommendation,
  IssueDefaultsRequest,
  IssueDefaults,
  TemplateForScoring,
  TemplateScoringContext,
  TemplateAIScore,
} from '../interfaces/ai-types';
// New Intelligent Smart Setup imports
import { ConversationManagerService } from './conversation-manager.service';
import { SemanticExtractorService } from './semantic-extractor.service';
import { QuestionGeneratorService } from './question-generator.service';
import { TemplateScorerService } from './template-scorer.service';
import {
  IntelligentCriteria,
  ConversationContext,
} from '../interfaces/intelligent-criteria.interface';

/**
 * Raw response structure from AI Intent Analyzer
 */
interface AIIntentResponse {
  projectName?: string;
  description?: string;
  projectType?: string;
  teamSize?: string;
  workStyle?: string;
  timeline?: string;
  extractedFeatures?: string[];
  excludedFeatures?: string[];
}

/**
 * Extracted criteria from user's natural language description
 */
export interface ExtractedCriteria {
  projectName?: string | null;
  description?: string | null;
  projectType: string | null;
  teamSize: string | null;
  workStyle: string | null;
  timeline: string | null;
  keyFeatures: string[];
}

/**
 * Template recommendation with reasoning
 */
export interface TemplateRecommendationResponse {
  template: {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    category: string;
    methodology: string;
  };
  confidence: number;
  reasoning: string;
}

/**
 * Response from AI chat - either a question or recommendation
 */
export interface AIChatResponse {
  conversationId: string;
  type: 'question' | 'recommendation';
  message?: string;
  extractedCriteria: ExtractedCriteria;
  missingCriteria?: string[];
  recommendation?: TemplateRecommendationResponse;
  alternatives?: TemplateRecommendationResponse[];
  suggestedConfig?: {
    sprintLength?: number;
    columns?: string[];
    labels?: string[];
  };
}

/**
 * Enhanced response from Intelligent AI chat
 */
export interface IntelligentChatResponse {
  conversationId: string;
  type: 'question' | 'recommendation';
  message?: string;
  extractedCriteria: Partial<IntelligentCriteria>;
  confidence: number;
  missingCriteria?: string[];
  recommendation?: TemplateRecommendationResponse;
  alternatives?: TemplateRecommendationResponse[];
  suggestedConfig?: {
    sprintLength?: number;
    columns?: string[];
    labels?: string[];
  };
}

/**
 * Request to AI chat
 */
export interface AIChatRequest {
  message: string;
  conversationId?: string;
  extractedCriteria?: Partial<ExtractedCriteria>;
}

// Mapping of keywords to project categories
const PROJECT_TYPE_KEYWORDS: Record<string, ProjectCategory> = {
  'mobile app': ProjectCategory.MOBILE_DEVELOPMENT,
  mobile: ProjectCategory.MOBILE_DEVELOPMENT,
  ios: ProjectCategory.MOBILE_DEVELOPMENT,
  android: ProjectCategory.MOBILE_DEVELOPMENT,
  app: ProjectCategory.MOBILE_DEVELOPMENT,
  website: ProjectCategory.WEBSITE_DEVELOPMENT,
  'web app': ProjectCategory.WEBSITE_DEVELOPMENT,
  web: ProjectCategory.WEBSITE_DEVELOPMENT,
  frontend: ProjectCategory.WEBSITE_DEVELOPMENT,
  software: ProjectCategory.SOFTWARE_DEVELOPMENT,
  backend: ProjectCategory.SOFTWARE_DEVELOPMENT,
  api: ProjectCategory.SOFTWARE_DEVELOPMENT,
  saas: ProjectCategory.SOFTWARE_DEVELOPMENT,
  marketing: ProjectCategory.MARKETING,
  campaign: ProjectCategory.MARKETING,
  content: ProjectCategory.MARKETING,
  'social media': ProjectCategory.MARKETING,
  'product launch': ProjectCategory.PRODUCT_LAUNCH,
  launch: ProjectCategory.PRODUCT_LAUNCH,
  release: ProjectCategory.PRODUCT_LAUNCH,
  research: ProjectCategory.RESEARCH,
  study: ProjectCategory.RESEARCH,
  experiment: ProjectCategory.RESEARCH,
  event: ProjectCategory.EVENT_PLANNING,
  conference: ProjectCategory.EVENT_PLANNING,
  meetup: ProjectCategory.EVENT_PLANNING,
  data: ProjectCategory.DATA_ANALYSIS,
  analytics: ProjectCategory.DATA_ANALYSIS,
  dashboard: ProjectCategory.DATA_ANALYSIS,
  design: ProjectCategory.DESIGN,
  ui: ProjectCategory.DESIGN,
  ux: ProjectCategory.DESIGN,
  creative: ProjectCategory.DESIGN,
  sales: ProjectCategory.SALES,
  crm: ProjectCategory.SALES,
  pipeline: ProjectCategory.SALES,
};

// Mapping of keywords to work styles
const WORK_STYLE_KEYWORDS: Record<string, ProjectMethodology> = {
  sprint: ProjectMethodology.SCRUM,
  sprints: ProjectMethodology.SCRUM,
  scrum: ProjectMethodology.SCRUM,
  '2 week': ProjectMethodology.SCRUM,
  'two week': ProjectMethodology.SCRUM,
  kanban: ProjectMethodology.KANBAN,
  continuous: ProjectMethodology.KANBAN,
  flow: ProjectMethodology.KANBAN,
  waterfall: ProjectMethodology.WATERFALL,
  phases: ProjectMethodology.WATERFALL,
  sequential: ProjectMethodology.WATERFALL,
  agile: ProjectMethodology.AGILE,
  flexible: ProjectMethodology.AGILE,
  iterative: ProjectMethodology.AGILE,
  hybrid: ProjectMethodology.HYBRID,
  mixed: ProjectMethodology.HYBRID,
  linear: ProjectMethodology.KANBAN,
  // Fallback keywords to break loops
  yes: ProjectMethodology.AGILE,
  sure: ProjectMethodology.AGILE,
  prefer: ProjectMethodology.AGILE,
  ok: ProjectMethodology.AGILE,
};

// Mapping of keywords to team sizes
const TEAM_SIZE_KEYWORDS: Record<
  string,
  '1' | '2-5' | '6-10' | '11-20' | '20+'
> = {
  solo: '1',
  'just me': '1',
  myself: '1',
  alone: '1',
  '1 person': '1',
  'one person': '1',
  '2 people': '2-5',
  '3 people': '2-5',
  '4 people': '2-5',
  '5 people': '2-5',
  'small team': '2-5',
  '2 developers': '2-5',
  '3 developers': '2-5',
  'few people': '2-5',
  'medium team': '6-10',
  '6 people': '6-10',
  '10 people': '6-10',
  'large team': '11-20',
  'big team': '11-20',
  'very large': '20+',
  enterprise: '20+',
};

// Mapping of keywords to timelines
const TIMELINE_KEYWORDS: Record<string, 'short' | 'medium' | 'long'> = {
  quick: 'short',
  fast: 'short',
  '1 month': 'short',
  '2 months': 'short',
  '3 months': 'short',
  'few weeks': 'short',
  medium: 'medium',
  '4 months': 'medium',
  '5 months': 'medium',
  '6 months': 'medium',
  'half year': 'medium',
  long: 'long',
  ongoing: 'long',
  continuous: 'long',
  year: 'long',
  '12 months': 'long',
};

@Injectable()
export class ProjectIntelligenceService {
  private readonly logger = new Logger(ProjectIntelligenceService.name);
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly aiProvider: AIProviderService,
    @InjectRepository(ProjectTemplate)
    private readonly templateRepo: Repository<ProjectTemplate>,
    @Optional() private cacheService?: CacheService,
    // New Intelligent Smart Setup services
    @Optional() private conversationManager?: ConversationManagerService,
    @Optional() private semanticExtractor?: SemanticExtractorService,
    @Optional() private questionGenerator?: QuestionGeneratorService,
    @Optional() private templateScorer?: TemplateScorerService,
  ) {}

  /**
   * Check if AI features are available
   */
  get isAvailable(): boolean {
    return this.aiProvider.isAvailable;
  }

  /**
   * Check if Intelligent Smart Setup services are available
   */
  get isIntelligentModeAvailable(): boolean {
    return !!(
      this.conversationManager &&
      this.semanticExtractor &&
      this.questionGenerator &&
      this.templateScorer
    );
  }

  // ==========================================
  // CONVERSATIONAL INTERFACE (Chat)
  // ==========================================

  /**
   * Process a user message and return either a follow-up question or recommendation
   */
  async processMessage(request: AIChatRequest): Promise<AIChatResponse> {
    const conversationId =
      request.conversationId || this.generateConversationId();

    // 1. Extract criteria from message (merge with existing)
    const extracted = await this.extractCriteria(
      request.message,
      request.extractedCriteria,
    );

    // 2. Check what's missing
    const missing = this.getMissingCriteria(extracted);

    // 3. If missing → generate follow-up question
    if (missing.length > 0) {
      const followUp = await this.generateFollowUpQuestion(extracted, missing);
      return {
        conversationId,
        type: 'question',
        message: followUp,
        extractedCriteria: extracted,
        missingCriteria: missing,
      };
    }

    // 4. All criteria present → generate recommendation
    return this.generateChatRecommendation(conversationId, extracted);
  }

  /**
   * NEW: Intelligent message processing with conversation context
   * Uses semantic extraction, context-aware questions, and 6-factor scoring
   */
  async processMessageIntelligent(
    message: string,
    conversationId?: string,
    userId: string = 'anonymous',
  ): Promise<IntelligentChatResponse> {
    // Ensure intelligent services are available
    if (!this.isIntelligentModeAvailable) {
      this.logger.warn(
        'Intelligent mode not available, falling back to legacy',
      );
      // Fall back to legacy processing
      const legacyResponse = await this.processMessage({
        message,
        conversationId,
      });
      return {
        ...legacyResponse,
        confidence: 50,
        extractedCriteria:
          legacyResponse.extractedCriteria as unknown as Partial<IntelligentCriteria>,
      };
    }

    // 1. Get or create conversation context
    const context = await this.conversationManager!.getOrCreateContext(
      conversationId,
      userId,
    );

    // 2. Add user message to conversation
    this.conversationManager!.addUserMessage(context, message);

    // 3. Semantic extraction from full conversation
    const extraction = await this.semanticExtractor!.extractFromConversation(
      context.messages,
      context.criteria,
    );

    // 4. Update context with new extraction
    this.conversationManager!.updateCriteria(
      context,
      extraction.criteria,
      extraction.confidence,
    );

    // 5. Determine missing required criteria
    const missingCriteria = this.conversationManager!.getMissingCriteria(
      context.criteria,
    );

    // 6. If missing criteria, generate next question
    if (missingCriteria.length > 0) {
      const question = await this.questionGenerator!.generateNextQuestion(
        context,
        missingCriteria,
      );

      if (question) {
        // Mark what we asked about
        const askedField = missingCriteria[0];
        this.conversationManager!.markQuestionAsked(context, askedField);
        this.conversationManager!.addAssistantMessage(context, question);

        // Save context to Redis
        await this.conversationManager!.saveContext(context);

        return {
          conversationId: context.id,
          type: 'question',
          message: question,
          extractedCriteria: context.criteria,
          confidence: extraction.confidence.overall,
          missingCriteria: missingCriteria,
        };
      }
    }

    // 7. All criteria present - generate recommendations
    return this.generateIntelligentRecommendation(context);
  }

  /**
   * Generate intelligent recommendations using 6-factor scoring
   */
  private async generateIntelligentRecommendation(
    context: ConversationContext,
  ): Promise<IntelligentChatResponse> {
    // Get top recommendations
    const { results, templates } =
      await this.templateScorer!.getTopRecommendations(
        context.criteria,
        null, // userPrefs - will be added in phase 3
        3,
      );

    if (results.length === 0) {
      // No templates found, generate a sorry message
      const message =
        "I couldn't find a perfect match for your project. Let me suggest a custom template.";
      this.conversationManager!.addAssistantMessage(context, message);
      await this.conversationManager!.saveContext(context);

      return {
        conversationId: context.id,
        type: 'recommendation',
        message,
        extractedCriteria: context.criteria,
        confidence: 30,
      };
    }

    // Build recommendations
    const topResult = results[0];
    const topTemplate = templates.get(topResult.templateId);

    const recommendation: TemplateRecommendationResponse | undefined =
      topTemplate
        ? {
            template: {
              id: topTemplate.id,
              name: topTemplate.name,
              description: topTemplate.description || '',
              icon: topTemplate.icon || '📋',
              color: topTemplate.color || '#3b82f6',
              category: topTemplate.category as string,
              methodology: topTemplate.methodology as string,
            },
            confidence: topResult.score,
            reasoning: topResult.reasons.join('. '),
          }
        : undefined;

    // Build alternatives
    const alternatives: TemplateRecommendationResponse[] = results
      .slice(1)
      .map((result) => {
        const template = templates.get(result.templateId);
        if (!template) return null;
        return {
          template: {
            id: template.id,
            name: template.name,
            description: template.description || '',
            icon: template.icon || '📋',
            color: template.color || '#3b82f6',
            category: template.category as string,
            methodology: template.methodology as string,
          },
          confidence: result.score,
          reasoning: result.reasons.join('. '),
        };
      })
      .filter((alt): alt is TemplateRecommendationResponse => alt !== null);

    // Generate confirmation message
    const confirmationMessage = this.questionGenerator!.generateConfirmation(
      context.criteria,
    );
    this.conversationManager!.addAssistantMessage(context, confirmationMessage);
    await this.conversationManager!.saveContext(context);

    // Build suggested config based on methodology
    const suggestedConfig = this.buildSuggestedConfig(context.criteria);

    return {
      conversationId: context.id,
      type: 'recommendation',
      message: confirmationMessage,
      extractedCriteria: context.criteria,
      confidence: topResult.confidence,
      recommendation,
      alternatives,
      suggestedConfig,
    };
  }

  /**
   * Build suggested configuration from criteria
   */
  private buildSuggestedConfig(criteria: IntelligentCriteria): {
    sprintLength?: number;
    columns?: string[];
    labels?: string[];
  } {
    const config: {
      sprintLength?: number;
      columns?: string[];
      labels?: string[];
    } = {};

    // Sprint length based on work style
    if (criteria.workStyle === ProjectMethodology.SCRUM) {
      config.sprintLength = 14; // 2 weeks default
      config.columns = [
        'Backlog',
        'Sprint Backlog',
        'In Progress',
        'In Review',
        'Done',
      ];
    } else if (criteria.workStyle === ProjectMethodology.KANBAN) {
      config.columns = ['To Do', 'In Progress', 'Review', 'Done'];
    }

    // Add labels based on external stakeholders
    if (criteria.hasExternalStakeholders) {
      config.labels = ['Client Review', 'Awaiting Approval', 'Urgent'];
    }

    return config;
  }

  // ==========================================
  // EXPERT SYSTEMS INTERFACE (Wizard/Logic)
  // ==========================================

  /**
   * Generate AI-powered project setup recommendations from structured request
   * (Migrated from AISmartSetupService)
   */
  async generateProjectRecommendation(
    request: ProjectRecommendationRequest,
  ): Promise<ProjectRecommendation | null> {
    if (!this.isAvailable) {
      this.logger.debug('AI not available, skipping project recommendation');
      return null;
    }

    // Check cache first
    const cacheKey = `ai:project:${this.hashRequest(request)}`;
    if (this.cacheService) {
      const cached =
        await this.cacheService.get<ProjectRecommendation>(cacheKey);
      if (cached) {
        this.logger.debug('Returning cached project recommendation');
        return cached;
      }
    }

    const systemPrompt = `You are an expert project management consultant with deep knowledge of Agile, Scrum, Kanban, and traditional methodologies.

Analyze the project details and provide optimal setup recommendations. Consider:
- Team size and experience level
- Project timeline and complexity
- Industry best practices

Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "methodology": "agile" | "scrum" | "kanban" | "waterfall" | "hybrid",
  "sprintDuration": number (days, use 0 for kanban),
  "issueTypes": ["array of 4-6 recommended issue types"],
  "teamRoles": [{"role": "string", "description": "brief description"}],
  "priorities": ["array of 3-4 priority levels"],
  "workflowStages": ["array of 4-6 workflow stages"],
  "reasoning": "1-2 sentence explanation",
  "confidence": number between 0 and 1
}`;

    const userPrompt = `Project Details:
- Name: ${request.projectName}
- Description: ${request.projectDescription || 'Not provided'}
- Team Size: ${request.teamSize} people
- Timeline: ${request.timeline} (short=1-3 months, medium=3-6 months, long=6+ months)
- Industry: ${request.industry}
- Team Experience: ${request.userExperience}

Provide optimized project setup recommendations.`;

    try {
      const response = await this.aiProvider.complete({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 800,
        responseFormat: 'json',
      });

      if (!response) return null;

      const recommendation = this.parseJSON<ProjectRecommendation>(
        response.content,
      );

      if (recommendation && this.cacheService) {
        await this.cacheService.set(cacheKey, recommendation, {
          ttl: this.CACHE_TTL,
        });
      }

      this.logger.log(
        `Generated project recommendation via ${response.provider} (${response.latencyMs}ms)`,
      );
      return recommendation;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Failed to generate project recommendation: ${message}`,
      );
      return null;
    }
  }

  /**
   * Generate AI-powered issue field defaults
   * (Migrated from AISmartSetupService)
   */
  async generateIssueDefaults(
    request: IssueDefaultsRequest,
  ): Promise<IssueDefaults | null> {
    if (!this.isAvailable) {
      return null;
    }

    const systemPrompt = `You are a project management AI assistant helping users create issues efficiently.

Suggest optimal defaults for a new issue based on the project context.

Return ONLY valid JSON matching this exact schema (no markdown):
{
  "suggestedType": "most appropriate issue type",
  "suggestedPriority": "Low" | "Medium" | "High" | "Critical",
  "suggestedAssignee": "team member name or null",
  "estimatedDueDate": "YYYY-MM-DD format or null",
  "suggestedLabels": ["optional array of relevant labels"],
  "reasoning": "brief 1-sentence explanation"
}`;

    const userPrompt = `Context:
- Project Type: ${request.projectType}
- Requested Issue Type: ${request.issueType || 'Not specified'}
- Team Members: ${request.teamMembers.length > 0 ? request.teamMembers.join(', ') : 'None listed'}
- Recent Issues: ${JSON.stringify(request.recentIssues?.slice(0, 5) || [])}

Suggest optimal defaults for this new issue.`;

    try {
      const response = await this.aiProvider.complete({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        maxTokens: 400,
        responseFormat: 'json',
      });

      if (!response) return null;

      return this.parseJSON<IssueDefaults>(response.content);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to generate issue defaults: ${message}`);
      return null;
    }
  }

  /**
   * Enhance template scoring with AI insights
   * (Migrated from AISmartSetupService)
   */
  async enhanceTemplateScoring(
    templates: TemplateForScoring[],
    context: TemplateScoringContext,
  ): Promise<TemplateAIScore[] | null> {
    if (!this.isAvailable || templates.length === 0) {
      return null;
    }

    const systemPrompt = `You are a project template recommendation expert.

Score each template (0-100) based on how well it fits the project context.
Higher scores mean better fit.

Return ONLY a valid JSON array (no markdown):
[{"templateId": "id", "aiScore": number, "reasoning": "brief reason"}]`;

    const userPrompt = `Project Context:
- Industry: ${context.industry}
- Team Size: ${context.teamSize}
- Experience Level: ${context.experience}

Available Templates:
${templates.map((t) => `- ${t.id}: ${t.name} (${t.category}, ${t.methodology})`).join('\n')}

Score each template for this context (0-100).`;

    try {
      const response = await this.aiProvider.complete({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        maxTokens: 500,
        responseFormat: 'json',
      });

      if (!response) return null;

      return this.parseJSON<TemplateAIScore[]>(response.content);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to enhance template scoring: ${message}`);
      return null;
    }
  }

  // ==========================================
  // PRIVATE HELPERS (Chat & Extraction)
  // ==========================================

  /**
   * Extract criteria from natural language message using AI
   */
  private async extractCriteria(
    message: string,
    existing?: Partial<ExtractedCriteria>,
  ): Promise<ExtractedCriteria> {
    // Start with existing or empty
    const currentStore: ExtractedCriteria = {
      projectName: existing?.projectName || null,
      description: existing?.description || null,
      projectType: existing?.projectType || null,
      teamSize: existing?.teamSize || null,
      workStyle: existing?.workStyle || null,
      timeline: existing?.timeline || null,
      keyFeatures: existing?.keyFeatures || [],
    };

    try {
      // Prompt for the AI
      const systemPrompt = `You are a Project Management Intent Analyzer.
      Your goal is to extract structured project attributes from user messages.

      Output JSON format:
      {
        "projectName": "Inferred project name from user input (e.g. 'building a cooking app' -> 'Cooking App') or null",
        "description": "Short summary of what they are building or null",
        "projectType": "software_development" | "marketing" | "product_launch" | "design" | "sales" | "research" | "event_planning" | "data_analysis" | "mobile_development" | "website_development" | null,
        "teamSize": "1" | "2-5" | "6-10" | "11-20" | "20+" | null,
        "workStyle": "agile" | "scrum" | "kanban" | "waterfall" | "hybrid" | null,
        "timeline": "short" | "medium" | "long" | null,
        "extractedFeatures": ["string array of extracted features like 'time tracking', 'bug reports'"],
        "excludedFeatures": ["string array of features the user explicitly wants to remove"]
      }

      Context Rules:
      - Infer 'Scrum' if user says 'sprints', '2-week cycles', 'points'.
      - Infer 'Kanban' if user says 'continuous', 'flow', 'just a board'.
      - Infer 'Agile' if user says 'flexible', 'iterative'.
      - If user agrees ("Yes", "Sure") to a previous question, infer the context implies agreement.
      - Extract a "projectName" if they mention what they are building. If generic (e.g. "a mobile app"), capitalize it nicely (e.g. "Mobile App Project").
      - Return NULL for fields not clearly present or implied.
      - If user says "no time tracking" or "remove bug reports", add them to 'excludedFeatures'.
      `;

      const userPrompt = `
      Current Knowledge: ${JSON.stringify(currentStore)}
      User Message: "${message}"

      Extract updated criteria. Merge new information with current knowledge.
      `;

      const response = await this.aiProvider.complete({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1, // High precision
        maxTokens: 300,
        responseFormat: 'json',
      });

      if (response && response.content) {
        const extracted = this.parseJSON<AIIntentResponse>(response.content);

        if (extracted) {
          // Merge logic
          return {
            projectName: extracted.projectName || currentStore.projectName,
            description: extracted.description || currentStore.description,
            projectType: extracted.projectType || currentStore.projectType,
            teamSize: extracted.teamSize || currentStore.teamSize,
            workStyle: extracted.workStyle || currentStore.workStyle,
            timeline: extracted.timeline || currentStore.timeline,
            keyFeatures: [
              ...new Set([
                ...currentStore.keyFeatures.filter(
                  (f) => !(extracted.excludedFeatures || []).includes(f),
                ),
                ...(extracted.extractedFeatures || []),
              ]),
            ],
          };
        }
      }
    } catch (error) {
      this.logger.error(
        'AI extraction failed, falling back to keywords',
        error,
      );
    }

    // Fallback to legacy keyword extraction if AI fails
    return this.extractCriteriaLegacy(message, currentStore);
  }

  /**
   * Legacy Keyword-based extraction (Fallback)
   */
  private extractCriteriaLegacy(
    message: string,
    existing: ExtractedCriteria,
  ): ExtractedCriteria {
    const lowerMessage = message.toLowerCase();
    const criteria = { ...existing };

    // Extract project name (e.g. "called X", "named X", "building X")
    if (!criteria.projectName) {
      const namePatterns = [
        /(?:called|named|titled)\s+["']?([^"'\s.]+(?:\s+[^"'\s.]+){0,3})["']?/i,
        /(?:building|create|make)\s+(?:a|an)\s+(?:new\s+)?([^"'\s.]+(?:\s+[^"'\s.]+){0,3}?)\s+(?:app|software|platform|system|project|tool)/i,
        /(?:project)\s+(?:is|called|named)\s+["']?([^"'\s.]+(?:\s+[^"'\s.]+){0,3})["']?/i,
      ];

      for (const pattern of namePatterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
          // Clean up the name
          let name = match[1].trim();
          // Remove common STOP words if caught
          name = name.replace(/^(a|an|the)\s+/i, '');

          if (name.length > 2 && name.length < 50) {
            criteria.projectName = name.charAt(0).toUpperCase() + name.slice(1);
            break;
          }
        }
      }
    }

    // Extract project type
    if (!criteria.projectType) {
      for (const [keyword, type] of Object.entries(PROJECT_TYPE_KEYWORDS)) {
        if (lowerMessage.includes(keyword)) {
          criteria.projectType = type;
          break;
        }
      }
    }

    // Extract team size
    if (!criteria.teamSize) {
      for (const [keyword, size] of Object.entries(TEAM_SIZE_KEYWORDS)) {
        if (lowerMessage.includes(keyword)) {
          criteria.teamSize = size;
          break;
        }
      }
      // Also check for number patterns like "3 devs" or "5 team members"
      const teamMatch = lowerMessage.match(
        /(\d+)\s*(people|developers|devs|members|persons)/,
      );
      if (teamMatch) {
        const count = parseInt(teamMatch[1]);
        if (count === 1) criteria.teamSize = '1';
        else if (count <= 5) criteria.teamSize = '2-5';
        else if (count <= 10) criteria.teamSize = '6-10';
        else if (count <= 20) criteria.teamSize = '11-20';
        else criteria.teamSize = '20+';
      }
    }

    // Extract work style
    if (!criteria.workStyle) {
      for (const [keyword, style] of Object.entries(WORK_STYLE_KEYWORDS)) {
        if (lowerMessage.includes(keyword)) {
          criteria.workStyle = style;
          break;
        }
      }
    }

    // Extract timeline
    if (!criteria.timeline) {
      for (const [keyword, time] of Object.entries(TIMELINE_KEYWORDS)) {
        if (lowerMessage.includes(keyword)) {
          criteria.timeline = time;
          break;
        }
      }
    }

    return criteria;
  }

  /**
   * Determine which criteria are still missing
   */
  private getMissingCriteria(criteria: ExtractedCriteria): string[] {
    const missing: string[] = [];

    // Required: projectType, teamSize, workStyle
    // Optional but helpful: timeline, keyFeatures

    if (!criteria.projectType) missing.push('projectType');
    if (!criteria.teamSize) missing.push('teamSize');
    if (!criteria.workStyle) missing.push('workStyle');

    // We don't require timeline and keyFeatures - can use defaults
    return missing;
  }

  /**
   * Generate a natural follow-up question using AI
   */
  private async generateFollowUpQuestion(
    extracted: ExtractedCriteria,
    missing: string[],
  ): Promise<string> {
    // Try AI-generated question first
    try {
      const prompt = this.buildFollowUpPrompt(extracted, missing);
      const aiResponse = await this.aiProvider.complete({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 150,
        temperature: 0.7,
      });

      if (aiResponse && aiResponse.content) {
        return aiResponse.content.trim();
      }
    } catch (error) {
      this.logger.warn('AI follow-up generation failed, using fallback', error);
    }

    // Fallback to rule-based questions
    return this.buildFallbackQuestion(extracted, missing);
  }

  /**
   * Build prompt for AI to generate follow-up question
   */
  private buildFollowUpPrompt(
    extracted: ExtractedCriteria,
    missing: string[],
  ): string {
    const knownInfo: string[] = [];
    if (extracted.projectType)
      knownInfo.push(`Project type: ${extracted.projectType}`);
    if (extracted.teamSize) knownInfo.push(`Team size: ${extracted.teamSize}`);
    if (extracted.workStyle)
      knownInfo.push(`Work style: ${extracted.workStyle}`);
    if (extracted.timeline) knownInfo.push(`Timeline: ${extracted.timeline}`);

    const missingLabels: Record<string, string> = {
      projectType: 'what type of project they are building',
      teamSize: 'how many people are on their team',
      workStyle: 'how they prefer to work (sprints, kanban, etc.)',
    };

    const neededInfo = missing.map((m) => missingLabels[m] || m).join(', ');

    return `You are a friendly project setup assistant. You're helping someone create a new project.

What we know so far:
${knownInfo.length > 0 ? knownInfo.join('\n') : 'Nothing yet'}

We still need to know: ${neededInfo}

Generate a SHORT, friendly follow-up question (1-2 sentences max) to gather this information.
- Be conversational, not formal
- Offer quick options when helpful (e.g., "Do you prefer sprints or continuous flow?")
- Don't ask more than 2 things at once

Just respond with the question, nothing else.`;
  }

  /**
   * Fallback question when AI is unavailable
   */
  private buildFallbackQuestion(
    extracted: ExtractedCriteria,
    missing: string[],
  ): string {
    const questions: string[] = [];

    if (missing.includes('projectType')) {
      questions.push(
        'What type of project are you building? (e.g., mobile app, website, marketing campaign)',
      );
    }
    if (missing.includes('teamSize')) {
      questions.push('How many people will be working on this?');
    }
    if (missing.includes('workStyle')) {
      questions.push('Do you prefer working in sprints or continuous flow?');
    }

    if (questions.length === 1) {
      return questions[0];
    }

    return `Got it! A few quick questions:\n${questions
      .slice(0, 2)
      .map((q, i) => `${i + 1}. ${q}`)
      .join('\n')}`;
  }

  /**
   * Generate template recommendation based on extracted criteria
   */
  private async generateChatRecommendation(
    conversationId: string,
    criteria: ExtractedCriteria,
  ): Promise<AIChatResponse> {
    // Find matching templates from database
    const templates = await this.templateRepo.find({
      where: { isActive: true },
      order: { usageCount: 'DESC' },
    });

    // Score templates based on criteria
    const scored = templates.map((template) => ({
      template,
      score: this.scoreTemplate(template, criteria),
    }));

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    // Get top recommendations
    const topTemplates = scored.slice(0, 3);

    if (topTemplates.length === 0) {
      // No templates found, use fallback
      return this.generateFallbackRecommendation(conversationId, criteria);
    }

    const primary = topTemplates[0];
    const alternatives = topTemplates.slice(1);

    // Generate reasoning using AI or fallback
    const reasoning = await this.generateReasoning(primary.template, criteria);

    return {
      conversationId,
      type: 'recommendation',
      extractedCriteria: criteria,
      recommendation: {
        template: {
          id: primary.template.id,
          name: primary.template.name,
          description: primary.template.description || '',
          icon: primary.template.icon || '📋',
          color: primary.template.color || '#3B82F6',
          category: primary.template.category,
          methodology: primary.template.methodology,
        },
        confidence: Math.round(primary.score * 100),
        reasoning,
      },
      alternatives: alternatives.map((alt) => ({
        template: {
          id: alt.template.id,
          name: alt.template.name,
          description: alt.template.description || '',
          icon: alt.template.icon || '📋',
          color: alt.template.color || '#6366F1',
          category: alt.template.category,
          methodology: alt.template.methodology,
        },
        confidence: Math.round(alt.score * 100),
        reasoning: `Alternative ${alt.template.methodology} workflow`,
      })),
      suggestedConfig: this.getSuggestedConfig(criteria),
    };
  }

  /**
   * Score a template based on how well it matches the criteria
   */
  private scoreTemplate(
    template: ProjectTemplate,
    criteria: ExtractedCriteria,
  ): number {
    let score = 0.5; // Base score

    // Category match (most important)
    if (template.category === criteria.projectType) {
      score += 0.3;
    }

    // Methodology match
    if (template.methodology === criteria.workStyle) {
      score += 0.2;
    }

    // Usage count boost (popular templates)
    if (template.usageCount > 100) {
      score += 0.05;
    }

    return Math.min(score, 1);
  }

  /**
   * Generate reasoning for why a template was recommended
   */
  private async generateReasoning(
    template: ProjectTemplate,
    criteria: ExtractedCriteria,
  ): Promise<string> {
    try {
      const prompt = `You are recommending the "${template.name}" template for a project.

Project details:
- Type: ${criteria.projectType}
- Team size: ${criteria.teamSize}
- Work style: ${criteria.workStyle}
- Timeline: ${criteria.timeline || 'not specified'}

Template methodology: ${template.methodology}

Write a SHORT reason (1-2 sentences) why this template is a great fit. Be specific about the match.`;

      const response = await this.aiProvider.complete({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 100,
        temperature: 0.7,
      });

      if (response && response.content) {
        return response.content.trim();
      }
    } catch {
      this.logger.warn('AI reasoning generation failed, using fallback');
    }

    // Fallback reasoning
    const reasons: string[] = [];
    if (template.category === criteria.projectType) {
      reasons.push(
        `Designed specifically for ${criteria.projectType?.replace('_', ' ')} projects`,
      );
    }
    if (template.methodology === criteria.workStyle) {
      reasons.push(`Uses your preferred ${criteria.workStyle} workflow`);
    }
    if (criteria.teamSize) {
      reasons.push(
        `Optimized for ${criteria.teamSize === '1' ? 'solo' : criteria.teamSize + ' person'} teams`,
      );
    }

    return reasons.join('. ') || 'Great match for your project requirements.';
  }

  /**
   * Generate fallback recommendation when no templates in DB
   */
  private generateFallbackRecommendation(
    conversationId: string,
    criteria: ExtractedCriteria,
  ): AIChatResponse {
    // Map criteria to fallback template
    const templateId = `${criteria.projectType || 'software'}-${criteria.workStyle || 'agile'}`;
    const templateName = this.getFallbackTemplateName(criteria);

    return {
      conversationId,
      type: 'recommendation',
      extractedCriteria: criteria,
      recommendation: {
        template: {
          id: templateId,
          name: templateName,
          description: `${templateName} with ${criteria.workStyle || 'agile'} workflow`,
          icon: this.getIconForCategory(
            (criteria.projectType as ProjectCategory) || null,
          ),
          color: this.getColorForCategory(
            (criteria.projectType as ProjectCategory) || null,
          ),
          category:
            criteria.projectType || ProjectCategory.SOFTWARE_DEVELOPMENT,
          methodology: criteria.workStyle || ProjectMethodology.AGILE,
        },
        confidence: 85,
        reasoning: `Matches your ${criteria.projectType?.replace('_', ' ')} project with ${criteria.workStyle} methodology.`,
      },
      suggestedConfig: this.getSuggestedConfig(criteria),
    };
  }

  /**
   * Get fallback template name based on criteria
   */
  private getFallbackTemplateName(criteria: ExtractedCriteria): string {
    const categoryNames: Record<string, string> = {
      [ProjectCategory.MOBILE_DEVELOPMENT]: 'Mobile App Development',
      [ProjectCategory.WEBSITE_DEVELOPMENT]: 'Website Development',
      [ProjectCategory.SOFTWARE_DEVELOPMENT]: 'Software Development',
      [ProjectCategory.MARKETING]: 'Marketing Campaign',
      [ProjectCategory.PRODUCT_LAUNCH]: 'Product Launch',
      [ProjectCategory.RESEARCH]: 'Research Project',
      [ProjectCategory.EVENT_PLANNING]: 'Event Planning',
      [ProjectCategory.DATA_ANALYSIS]: 'Data Analysis',
      [ProjectCategory.DESIGN]: 'Design Project',
      [ProjectCategory.SALES]: 'Sales Pipeline',
    };

    const base = categoryNames[criteria.projectType || ''] || 'Project';
    const methodology = criteria.workStyle
      ? criteria.workStyle.charAt(0).toUpperCase() + criteria.workStyle.slice(1)
      : 'Agile';

    return `${base} (${methodology})`;
  }

  /**
   * Get suggested configuration based on criteria
   */
  private getSuggestedConfig(
    criteria: ExtractedCriteria,
  ): AIChatResponse['suggestedConfig'] {
    const config: AIChatResponse['suggestedConfig'] = {};

    // Sprint length based on timeline
    if (criteria.workStyle === ProjectMethodology.SCRUM) {
      config.sprintLength = criteria.timeline === 'short' ? 7 : 14;
    }

    // Columns based on methodology
    if (criteria.workStyle === ProjectMethodology.KANBAN) {
      config.columns = ['Backlog', 'In Progress', 'Review', 'Done'];
    } else if (criteria.workStyle === ProjectMethodology.SCRUM) {
      config.columns = ['To Do', 'In Progress', 'In Review', 'Done'];
    } else {
      config.columns = ['To Do', 'In Progress', 'Done'];
    }

    // Labels based on features
    config.labels = ['feature', 'bug', 'improvement'];
    if (criteria.keyFeatures.includes('releases')) {
      config.labels.push('release');
    }

    return config;
  }

  /**
   * Get icon for category
   */
  private getIconForCategory(category: ProjectCategory | null): string {
    const icons: Record<string, string> = {
      [ProjectCategory.MOBILE_DEVELOPMENT]: '📱',
      [ProjectCategory.WEBSITE_DEVELOPMENT]: '🌐',
      [ProjectCategory.SOFTWARE_DEVELOPMENT]: '💻',
      [ProjectCategory.MARKETING]: '📢',
      [ProjectCategory.PRODUCT_LAUNCH]: '🚀',
      [ProjectCategory.RESEARCH]: '🔬',
      [ProjectCategory.EVENT_PLANNING]: '🎉',
      [ProjectCategory.DATA_ANALYSIS]: '📊',
      [ProjectCategory.DESIGN]: '🎨',
      [ProjectCategory.SALES]: '💼',
    };
    return icons[category || ''] || '📋';
  }

  /**
   * Get color for category
   */
  private getColorForCategory(category: ProjectCategory | null): string {
    const colors: Record<string, string> = {
      [ProjectCategory.MOBILE_DEVELOPMENT]: '#EC4899',
      [ProjectCategory.WEBSITE_DEVELOPMENT]: '#8B5CF6',
      [ProjectCategory.SOFTWARE_DEVELOPMENT]: '#3B82F6',
      [ProjectCategory.MARKETING]: '#10B981',
      [ProjectCategory.PRODUCT_LAUNCH]: '#F59E0B',
      [ProjectCategory.RESEARCH]: '#06B6D4',
      [ProjectCategory.EVENT_PLANNING]: '#F97316',
      [ProjectCategory.DATA_ANALYSIS]: '#14B8A6',
      [ProjectCategory.DESIGN]: '#A855F7',
      [ProjectCategory.SALES]: '#EF4444',
    };
    return colors[category || ''] || '#3B82F6';
  }

  /**
   * Generate unique conversation ID
   */
  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Safely parse JSON with error handling
   */
  private parseJSON<T>(content: string): T | null {
    try {
      // Try to extract JSON if wrapped in markdown
      let jsonStr = content.trim();

      // Remove markdown code blocks if present
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }

      return JSON.parse(jsonStr) as T;
    } catch {
      this.logger.warn(`Failed to parse AI response as JSON: ${content}`);
      return null;
    }
  }

  /**
   * Create a simple hash for cache key
   */
  private hashRequest(request: object): string {
    return Buffer.from(JSON.stringify(request)).toString('base64').slice(0, 32);
  }
}
