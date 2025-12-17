/**
 * Semantic Extractor Service
 * LLM-based extraction with function calling for Smart Setup AI
 */

import { Injectable, Logger } from '@nestjs/common';
import { AIProviderService } from './ai-provider.service';
import {
  IntelligentCriteria,
  CriteriaConfidence,
  ConversationMessage,
  ExtractionResult,
  createEmptyCriteria,
  createEmptyConfidence,
} from '../interfaces/intelligent-criteria.interface';
import {
  ProjectCategory,
  ProjectMethodology,
} from '../../project-templates/entities/project-template.entity';

/**
 * Type for AI extraction response (used for safe JSON parsing)
 */
import { StakeholderType } from '../interfaces/intelligent-criteria.interface';

/**
 * Raw AI extraction response before validation
 */
interface AIExtractionResponse {
  projectName?: string | null;
  description?: string | null;
  projectType?: string | null;
  teamSize?: string | null;
  workStyle?: string | null;
  timeline?: string | null;
  hasExternalStakeholders?: boolean;
  stakeholderType?: string | null;
  industry?: string | null;
  wantsApprovalWorkflow?: boolean;
  keyFeatures?: string[];
  excludedFeatures?: string[];
  confidence?: {
    projectType?: number;
    teamSize?: number;
    workStyle?: number;
    timeline?: number;
    hasExternalStakeholders?: number;
    industry?: number;
  };
}

/** Valid stakeholder types */
const VALID_STAKEHOLDER_TYPES: StakeholderType[] = [
  'client',
  'partner',
  'public',
  'internal',
];

/**
 * Keywords for fallback extraction when AI fails
 */
const FALLBACK_KEYWORDS = {
  projectType: {
    // Mobile/App development
    mobile: ProjectCategory.MOBILE_DEVELOPMENT,
    'mobile app': ProjectCategory.MOBILE_DEVELOPMENT,
    ios: ProjectCategory.MOBILE_DEVELOPMENT,
    android: ProjectCategory.MOBILE_DEVELOPMENT,
    'building an app': ProjectCategory.MOBILE_DEVELOPMENT,
    'build an app': ProjectCategory.MOBILE_DEVELOPMENT,
    'app for': ProjectCategory.MOBILE_DEVELOPMENT,
    // Website development
    website: ProjectCategory.WEBSITE_DEVELOPMENT,
    'web app': ProjectCategory.WEBSITE_DEVELOPMENT,
    'web application': ProjectCategory.WEBSITE_DEVELOPMENT,
    dashboard: ProjectCategory.WEBSITE_DEVELOPMENT,
    portal: ProjectCategory.WEBSITE_DEVELOPMENT,
    // Software development
    software: ProjectCategory.SOFTWARE_DEVELOPMENT,
    backend: ProjectCategory.SOFTWARE_DEVELOPMENT,
    api: ProjectCategory.SOFTWARE_DEVELOPMENT,
    'make a software': ProjectCategory.SOFTWARE_DEVELOPMENT,
    saas: ProjectCategory.SOFTWARE_DEVELOPMENT,
    platform: ProjectCategory.SOFTWARE_DEVELOPMENT,
    // Marketing
    marketing: ProjectCategory.MARKETING,
    campaign: ProjectCategory.MARKETING,
    'brand launch': ProjectCategory.MARKETING,
    // Product launch
    'product launch': ProjectCategory.PRODUCT_LAUNCH,
    launch: ProjectCategory.PRODUCT_LAUNCH,
    // Research
    research: ProjectCategory.RESEARCH,
    // Event planning
    event: ProjectCategory.EVENT_PLANNING,
    conference: ProjectCategory.EVENT_PLANNING,
    // Data analysis
    data: ProjectCategory.DATA_ANALYSIS,
    analytics: ProjectCategory.DATA_ANALYSIS,
    // Design
    design: ProjectCategory.DESIGN,
    ui: ProjectCategory.DESIGN,
    ux: ProjectCategory.DESIGN,
    mockup: ProjectCategory.DESIGN,
    // Sales
    sales: ProjectCategory.SALES,
    crm: ProjectCategory.SALES,
  } as Record<string, ProjectCategory>,

  workStyle: {
    sprint: ProjectMethodology.SCRUM,
    sprints: ProjectMethodology.SCRUM,
    scrum: ProjectMethodology.SCRUM,
    'prefer sprints': ProjectMethodology.SCRUM,
    'i prefer sprints': ProjectMethodology.SCRUM,
    'in sprints': ProjectMethodology.SCRUM,
    kanban: ProjectMethodology.KANBAN,
    continuous: ProjectMethodology.KANBAN,
    'continuous flow': ProjectMethodology.KANBAN,
    "don't do sprints": ProjectMethodology.KANBAN,
    'no sprints': ProjectMethodology.KANBAN,
    stages: ProjectMethodology.KANBAN,
    board: ProjectMethodology.KANBAN,
    agile: ProjectMethodology.AGILE,
    flexible: ProjectMethodology.AGILE,
    waterfall: ProjectMethodology.WATERFALL,
    phases: ProjectMethodology.WATERFALL,
    hybrid: ProjectMethodology.HYBRID,
  } as Record<string, ProjectMethodology>,

  teamSize: {
    // Solo patterns
    solo: '1',
    'just me': '1',
    myself: '1',
    alone: '1',
    // 2-person patterns (CRITICAL: these must be checked before "just me")
    'me and my buddy': '2-5',
    'me and a buddy': '2-5',
    'me and my partner': '2-5',
    'me and a friend': '2-5',
    'just us': '2-5',
    'two of us': '2-5',
    'couple of us': '2-5',
    'me plus': '2-5',
    'myself and': '2-5',
    // Small team patterns
    'small team': '2-5',
    'tiny team': '2-5',
    'few people': '2-5',
    'tiny startup': '2-5',
    'small startup': '2-5',
    // Medium team patterns
    'medium team': '6-10',
    'growing team': '6-10',
    // Large team patterns
    'large team': '11-20',
    'big team': '11-20',
    // Enterprise patterns
    enterprise: '20+',
    corporation: '20+',
    'large company': '20+',
  } as Record<string, string>,

  externalStakeholders: [
    'client',
    'customer',
    'external',
    'stakeholder',
    'client approval',
    'client review',
    'agency',
    'freelance',
    'contractor',
    'for a client',
    'clients will',
    'approve mockups',
    'doing this for',
    'working for a',
  ],

  // NEW: Industry keywords for better context extraction
  industry: {
    healthcare: 'healthcare',
    hospital: 'healthcare',
    medical: 'healthcare',
    patient: 'healthcare',
    clinic: 'healthcare',
    fintech: 'fintech',
    banking: 'fintech',
    finance: 'fintech',
    payment: 'fintech',
    'financial services': 'fintech',
    education: 'education',
    school: 'education',
    university: 'education',
    'e-learning': 'education',
    ecommerce: 'retail',
    'e-commerce': 'retail',
    retail: 'retail',
    shop: 'retail',
    store: 'retail',
    logistics: 'logistics',
    shipping: 'logistics',
    delivery: 'logistics',
    'real estate': 'real_estate',
    property: 'real_estate',
    gaming: 'gaming',
    game: 'gaming',
  } as Record<string, string>,
};

/**
 * Keywords that indicate user wants to skip providing certain info
 */
const SKIP_KEYWORDS: Record<string, string[]> = {
  projectName: [
    'no name',
    "don't know",
    'not sure',
    'skip',
    'later',
    'no idea',
    'random',
    'you choose',
    'generate one',
    'pick one',
    'any name',
    "doesn't matter",
  ],
  description: [
    "don't know",
    'not sure',
    'skip',
    "can't describe",
    'hard to explain',
    'just a project',
  ],
};

@Injectable()
export class SemanticExtractorService {
  private readonly logger = new Logger(SemanticExtractorService.name);

  constructor(private readonly aiProvider: AIProviderService) {}

  /**
   * Extract criteria from full conversation using AI
   */
  async extractFromConversation(
    messages: ConversationMessage[],
    existingCriteria: Partial<IntelligentCriteria>,
  ): Promise<ExtractionResult> {
    // Build conversation text
    const conversationText = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    // Try AI extraction first
    try {
      return await this.extractWithAI(conversationText, existingCriteria);
    } catch (error) {
      this.logger.warn('AI extraction failed, using keyword fallback', error);
    }

    // Fallback to keyword extraction
    return this.extractWithKeywords(messages, existingCriteria);
  }

  /**
   * AI-powered extraction with structured prompts
   */
  private async extractWithAI(
    conversationText: string,
    existingCriteria: Partial<IntelligentCriteria>,
  ): Promise<ExtractionResult> {
    const systemPrompt = this.buildExtractionPrompt();

    const userPrompt = `
EXISTING KNOWLEDGE:
${JSON.stringify(existingCriteria, null, 2)}

FULL CONVERSATION:
${conversationText}

Extract all project criteria from the conversation. Preserve existing values unless explicitly contradicted.
Return a JSON object with the extracted criteria.
`;

    const response = await this.aiProvider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      maxTokens: 600,
      responseFormat: 'json',
    });

    if (!response?.content) {
      throw new Error('No response from AI provider');
    }

    // Parse AI response
    const parsed = this.parseAIResponse(response.content);

    // Merge with existing criteria
    const mergedCriteria = this.mergeCriteria(
      existingCriteria,
      parsed.criteria,
    );
    const newlyExtracted = this.findNewlyExtracted(
      existingCriteria,
      mergedCriteria,
    );

    return {
      criteria: mergedCriteria,
      confidence: parsed.confidence,
      newlyExtracted,
    };
  }

  /**
   * Build the extraction prompt for AI
   */
  private buildExtractionPrompt(): string {
    return `You are a Project Management Intent Analyzer for a Smart Setup AI.
Your goal is to extract structured project attributes from user conversations.

OUTPUT FORMAT (JSON only, no markdown):
{
  "projectName": "Inferred project name or null",
  "description": "Short summary of what they're building or null",
  "projectType": "software_development" | "marketing" | "product_launch" | "design" | "sales" | "research" | "event_planning" | "data_analysis" | "mobile_development" | "website_development" | null,
  "teamSize": "1" | "2-5" | "6-10" | "11-20" | "20+" | null,
  "workStyle": "agile" | "scrum" | "kanban" | "waterfall" | "hybrid" | null,
  "timeline": "short" | "medium" | "long" | null,
  "hasExternalStakeholders": true/false (detect if they mention clients, external stakeholders, agencies, etc.),
  "stakeholderType": "client" | "partner" | "public" | "internal" | null,
  "industry": "healthcare" | "fintech" | "education" | "retail" | etc. or null,
  "wantsApprovalWorkflow": true/false (detect if they mention approval stages, client sign-off, review cycles),
  "keyFeatures": ["array of features they want"],
  "excludedFeatures": ["array of features they DON'T want"],
  "confidence": {
    "projectType": 0-100,
    "teamSize": 0-100,
    "workStyle": 0-100,
    "timeline": 0-100,
    "hasExternalStakeholders": 0-100,
    "industry": 0-100
  }
}

EXTRACTION RULES:
1. "me and 2 designers plus a freelancer" = teamSize "2-5" (count all people mentioned)
2. "we don't do strict sprints" or "move through stages" = workStyle "kanban"
3. "for a client" or "client approval" = hasExternalStakeholders: true
4. "healthcare client" = industry: "healthcare" + hasExternalStakeholders: true
5. "4 months" = timeline "medium" (1-3 short, 3-6 medium, 6+ long)
6. Preserve existing values unless explicitly contradicted
7. Return null for fields not clearly present
8. Be generous with confidence scores if context is clear`;
  }

  /**
   * Parse AI response into structured format
   */
  private parseAIResponse(content: string): {
    criteria: Partial<IntelligentCriteria>;
    confidence: CriteriaConfidence;
  } {
    try {
      // Clean up potential markdown formatting
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent
          .replace(/```json?\n?/g, '')
          .replace(/```$/g, '');
      }

      const parsed: AIExtractionResponse = JSON.parse(
        cleanContent,
      ) as AIExtractionResponse;

      // Extract confidence
      const confidence: CriteriaConfidence = {
        projectType: parsed.confidence?.projectType || 0,
        teamSize: parsed.confidence?.teamSize || 0,
        workStyle: parsed.confidence?.workStyle || 0,
        timeline: parsed.confidence?.timeline || 0,
        hasExternalStakeholders:
          parsed.confidence?.hasExternalStakeholders || 0,
        industry: parsed.confidence?.industry || 0,
        overall: 0,
      };

      // Calculate overall confidence
      const scores = Object.values(confidence).filter(
        (v): v is number => typeof v === 'number' && v > 0,
      );
      confidence.overall =
        scores.length > 0
          ? Math.round(
              scores.reduce((a: number, b: number) => a + b, 0) / scores.length,
            )
          : 0;

      // Extract criteria
      const criteria: Partial<IntelligentCriteria> = {
        projectName: parsed.projectName || null,
        description: parsed.description || null,
        projectType: this.validateProjectType(parsed.projectType),
        teamSize: this.validateTeamSize(parsed.teamSize),
        workStyle: this.validateWorkStyle(parsed.workStyle),
        timeline: this.validateTimeline(parsed.timeline),
        hasExternalStakeholders: parsed.hasExternalStakeholders === true,
        stakeholderType: this.validateStakeholderType(parsed.stakeholderType),
        industry: parsed.industry || null,
        wantsApprovalWorkflow: parsed.wantsApprovalWorkflow === true,
        keyFeatures: Array.isArray(parsed.keyFeatures)
          ? parsed.keyFeatures
          : [],
        excludedFeatures: Array.isArray(parsed.excludedFeatures)
          ? parsed.excludedFeatures
          : [],
      };

      return { criteria, confidence };
    } catch (error) {
      this.logger.error('Failed to parse AI response', error);
      return {
        criteria: {},
        confidence: createEmptyConfidence(),
      };
    }
  }

  /**
   * Keyword-based fallback extraction
   */
  private extractWithKeywords(
    messages: ConversationMessage[],
    existingCriteria: Partial<IntelligentCriteria>,
  ): ExtractionResult {
    const criteria: IntelligentCriteria = {
      ...createEmptyCriteria(),
      ...existingCriteria,
    };
    const confidence = createEmptyConfidence();
    const newlyExtracted: string[] = [];

    // Combine all user messages
    const userText = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content.toLowerCase())
      .join(' ');

    // Extract project type (sorted by length - longer matches first)
    if (!criteria.projectType) {
      const sortedProjectKeywords = Object.entries(
        FALLBACK_KEYWORDS.projectType,
      ).sort((a, b) => b[0].length - a[0].length);

      for (const [keyword, type] of sortedProjectKeywords) {
        if (userText.includes(keyword)) {
          criteria.projectType = type;
          confidence.projectType = 70;
          newlyExtracted.push('projectType');
          break;
        }
      }
    }

    // Extract work style (sorted by length - longer matches first)
    if (!criteria.workStyle) {
      const sortedWorkStyleKeywords = Object.entries(
        FALLBACK_KEYWORDS.workStyle,
      ).sort((a, b) => b[0].length - a[0].length);

      for (const [keyword, style] of sortedWorkStyleKeywords) {
        if (userText.includes(keyword)) {
          criteria.workStyle = style;
          confidence.workStyle = 70;
          newlyExtracted.push('workStyle');
          break;
        }
      }
    }

    // Extract team size (sorted by length - longer matches first, e.g. "me and my buddy" before "just me")
    if (!criteria.teamSize) {
      const sortedTeamKeywords = Object.entries(
        FALLBACK_KEYWORDS.teamSize,
      ).sort((a, b) => b[0].length - a[0].length);

      for (const [keyword, size] of sortedTeamKeywords) {
        if (userText.includes(keyword)) {
          criteria.teamSize = size as '1' | '2-5' | '6-10' | '11-20' | '20+';
          confidence.teamSize = 70;
          newlyExtracted.push('teamSize');
          break;
        }
      }

      // Try number patterns: "3 developers", "5 people", etc.
      if (!criteria.teamSize) {
        const teamMatch = userText.match(
          /(\d+)\s*(people|developers|devs|designers|engineers|members|persons|of us)/,
        );
        if (teamMatch) {
          const count = parseInt(teamMatch[1], 10);
          if (count === 1) criteria.teamSize = '1';
          else if (count <= 5) criteria.teamSize = '2-5';
          else if (count <= 10) criteria.teamSize = '6-10';
          else if (count <= 20) criteria.teamSize = '11-20';
          else criteria.teamSize = '20+';
          confidence.teamSize = 60;
          newlyExtracted.push('teamSize');
        }

        // Try "me and X" pattern
        const meAndMatch = userText.match(
          /(?:me|myself)\s+(?:and|plus)\s+(\d+)/,
        );
        if (meAndMatch && !criteria.teamSize) {
          const count = parseInt(meAndMatch[1], 10) + 1;
          if (count <= 5) criteria.teamSize = '2-5';
          else if (count <= 10) criteria.teamSize = '6-10';
          else if (count <= 20) criteria.teamSize = '11-20';
          else criteria.teamSize = '20+';
          confidence.teamSize = 60;
          newlyExtracted.push('teamSize');
        }
      }
    }

    // Extract external stakeholders
    if (!criteria.hasExternalStakeholders) {
      for (const keyword of FALLBACK_KEYWORDS.externalStakeholders) {
        if (userText.includes(keyword)) {
          criteria.hasExternalStakeholders = true;
          confidence.hasExternalStakeholders = 70;
          newlyExtracted.push('hasExternalStakeholders');
          break;
        }
      }
    }

    // Extract industry (NEW)
    if (!criteria.industry) {
      // Sort keywords by length (longest first) to match more specific terms
      const sortedIndustryKeywords = Object.entries(
        FALLBACK_KEYWORDS.industry,
      ).sort((a, b) => b[0].length - a[0].length);

      for (const [keyword, industry] of sortedIndustryKeywords) {
        if (userText.includes(keyword)) {
          criteria.industry = industry;
          confidence.industry = 70;
          newlyExtracted.push('industry');
          break;
        }
      }
    }

    // Extract description (Fallback: use the last user message if it's substantial)
    if (!criteria.description) {
      const lastUserMessage = messages.filter((m) => m.role === 'user').pop();

      if (lastUserMessage) {
        const content = lastUserMessage.content.trim();
        // Ignore very short responses or simple confirmations/rejections
        // and ensure it's not just a skip command
        const isSkip = this.detectSkipIntents(content).length > 0;
        const isShort = content.length < 3;
        const isConfirm = this.isConfirmation(content);
        const isReject = this.isRejection(content);

        if (!isSkip && !isShort && !isConfirm && !isReject) {
          criteria.description = content;
          // Low confidence since it's a raw dump
          newlyExtracted.push('description');
        }
      }
    }

    // Calculate overall confidence
    const scores = Object.values(confidence).filter(
      (v): v is number => typeof v === 'number' && v > 0,
    );
    confidence.overall =
      scores.length > 0
        ? Math.round(
            scores.reduce((a: number, b: number) => a + b, 0) / scores.length,
          )
        : 0;

    return { criteria, confidence, newlyExtracted };
  }

  /**
   * Merge new criteria with existing, preserving non-null values
   */
  private mergeCriteria(
    existing: Partial<IntelligentCriteria>,
    newCriteria: Partial<IntelligentCriteria>,
  ): IntelligentCriteria {
    const merged = createEmptyCriteria();

    // Start with all existing values
    for (const [key, value] of Object.entries(existing)) {
      if (value !== null && value !== undefined) {
        (merged as unknown as Record<string, unknown>)[key] = value;
      }
    }

    // Override with new non-null values
    for (const [key, value] of Object.entries(newCriteria)) {
      if (value !== null && value !== undefined) {
        // Special handling for arrays
        if (Array.isArray(value) && value.length > 0) {
          const existingArray = (merged as unknown as Record<string, unknown>)[
            key
          ];
          if (Array.isArray(existingArray)) {
            const merged1 = [
              ...(existingArray as unknown[]),
              ...(value as unknown[]),
            ];
            (merged as unknown as Record<string, unknown>)[key] = [
              ...new Set(merged1),
            ];
          } else {
            (merged as unknown as Record<string, unknown>)[key] = value;
          }
        } else if (!Array.isArray(value)) {
          (merged as unknown as Record<string, unknown>)[key] = value;
        }
      }
    }

    return merged;
  }

  /**
   * Find which fields were newly extracted this turn
   */
  private findNewlyExtracted(
    before: Partial<IntelligentCriteria>,
    after: IntelligentCriteria,
  ): string[] {
    const newlyExtracted: string[] = [];
    const tracked = [
      'projectType',
      'teamSize',
      'workStyle',
      'timeline',
      'hasExternalStakeholders',
      'industry',
    ];

    for (const field of tracked) {
      const beforeValue = (before as unknown as Record<string, unknown>)[field];
      const afterValue = (after as unknown as Record<string, unknown>)[field];

      if (
        (beforeValue === null ||
          beforeValue === undefined ||
          beforeValue === false) &&
        afterValue !== null &&
        afterValue !== undefined &&
        afterValue !== false
      ) {
        newlyExtracted.push(field);
      }
    }

    return newlyExtracted;
  }

  // Validation helpers
  private validateProjectType(value: unknown): ProjectCategory | null {
    if (
      typeof value === 'string' &&
      Object.values(ProjectCategory).includes(value as ProjectCategory)
    ) {
      return value as ProjectCategory;
    }
    return null;
  }

  private validateWorkStyle(value: unknown): ProjectMethodology | null {
    if (
      typeof value === 'string' &&
      Object.values(ProjectMethodology).includes(value as ProjectMethodology)
    ) {
      return value as ProjectMethodology;
    }
    return null;
  }

  private validateTeamSize(
    value: unknown,
  ): '1' | '2-5' | '6-10' | '11-20' | '20+' | null {
    const validSizes = ['1', '2-5', '6-10', '11-20', '20+'];
    if (typeof value === 'string' && validSizes.includes(value)) {
      return value as '1' | '2-5' | '6-10' | '11-20' | '20+';
    }
    return null;
  }

  private validateTimeline(value: unknown): 'short' | 'medium' | 'long' | null {
    const validTimelines = ['short', 'medium', 'long'];
    if (typeof value === 'string' && validTimelines.includes(value)) {
      return value as 'short' | 'medium' | 'long';
    }
    return null;
  }

  private validateStakeholderType(value: unknown): StakeholderType | undefined {
    if (
      typeof value === 'string' &&
      VALID_STAKEHOLDER_TYPES.includes(value as StakeholderType)
    ) {
      return value as StakeholderType;
    }
    return undefined;
  }

  /**
   * Detect skip intents from user's message
   * Returns array of field names where user indicated they want to skip
   */
  detectSkipIntents(message: string): string[] {
    const lowerMessage = message.toLowerCase();
    const skipIntents: string[] = [];

    for (const [field, keywords] of Object.entries(SKIP_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerMessage.includes(keyword)) {
          skipIntents.push(field);
          break;
        }
      }
    }

    return skipIntents;
  }

  /**
   * Check if message indicates user wants to skip project name
   */
  isSkippingProjectName(message: string): boolean {
    return this.detectSkipIntents(message).includes('projectName');
  }

  /**
   * Check if message indicates confirmation/acceptance
   */
  isConfirmation(message: string): boolean {
    const confirmKeywords = [
      'yes',
      'yeah',
      'yep',
      'sure',
      'ok',
      'okay',
      'sounds good',
      'that works',
      'perfect',
      'good',
      'great',
      'fine',
      'love it',
      'like it',
      'accepted',
      'confirm',
      'go with',
      'use that',
    ];
    const lowerMessage = message.toLowerCase();
    return confirmKeywords.some((kw) => lowerMessage.includes(kw));
  }

  /**
   * Check if message indicates rejection
   */
  isRejection(message: string): boolean {
    const rejectKeywords = [
      'no',
      'nope',
      "don't like",
      'different',
      'another',
      'try again',
      'not that',
      'something else',
      'change',
      'prefer',
      'rather',
      'instead',
    ];
    const lowerMessage = message.toLowerCase();
    return rejectKeywords.some((kw) => lowerMessage.includes(kw));
  }
}
