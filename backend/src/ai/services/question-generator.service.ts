/**
 * Question Generator Service
 * Context-aware question generation for Smart Setup AI
 */

import { Injectable, Logger } from '@nestjs/common';
import { AIProviderService } from './ai-provider.service';
import {
  ConversationContext,
  IntelligentCriteria,
  QUESTION_PRIORITY,
  REQUIRED_CRITERIA,
} from '../interfaces/intelligent-criteria.interface';

/**
 * Fallback questions when AI is unavailable
 * Used for each field type with context-awareness
 */
const FALLBACK_QUESTIONS: Record<string, string> = {
  projectName: 'What would you like to call this project?',
  description:
    "Tell me more about what you're building - what problem does it solve?",
  // NEW: Industry question - critical for matching with 19 templates
  industry:
    'What industry is this for? Healthcare, fintech, e-commerce, education, or something else?',
  projectType:
    'What type of project are you building? (e.g., mobile app, website, marketing campaign)',
  teamSize: 'How many people will be working on this project?',
  workStyle:
    'Do you prefer working in sprints (fixed cycles) or continuous flow (cards moving through stages)?',
  hasExternalStakeholders:
    'Will clients or external stakeholders need access to this project?',
  timeline:
    "What's your expected timeline? (Quick: 1-3 months, Medium: 3-6 months, Long: 6+ months)",
};

/**
 * Context-aware industry questions based on project type
 */
const INDUSTRY_QUESTIONS_BY_TYPE: Record<string, string> = {
  software_development:
    'What kind of software? A healthcare app, fintech platform, e-commerce system, or something else?',
  mobile_development:
    'What industry is your mobile app for? Healthcare, finance, retail, education, or something else?',
  website_development:
    'What industry is this website for? E-commerce, healthcare, education, or something else?',
  marketing:
    'What industry is your marketing campaign for? Tech, retail, healthcare, or something else?',
  default:
    'What industry is this project for? Healthcare, fintech, e-commerce, education, or something else?',
};

@Injectable()
export class QuestionGeneratorService {
  private readonly logger = new Logger(QuestionGeneratorService.name);

  constructor(private readonly aiProvider: AIProviderService) {}

  /**
   * Generate the next question to ask
   * Returns null if no more questions needed
   */
  async generateNextQuestion(
    context: ConversationContext,
    missingFields: (keyof IntelligentCriteria)[],
  ): Promise<string | null> {
    // Filter out fields we've already asked about
    const trulyMissing = missingFields.filter(
      (field) => !context.askedQuestions.includes(field),
    );

    if (trulyMissing.length === 0) {
      // All required questions asked, ready for recommendation
      return null;
    }

    // Prioritize which field to ask about
    const nextField = this.prioritizeField(trulyMissing);

    // Generate contextual question
    return this.generateContextualQuestion(context, nextField);
  }

  /**
   * Prioritize which field to ask about next
   */
  private prioritizeField(
    missingFields: (keyof IntelligentCriteria)[],
  ): keyof IntelligentCriteria {
    // First, prioritize required fields
    for (const field of REQUIRED_CRITERIA) {
      if (missingFields.includes(field)) {
        return field;
      }
    }

    // Then follow general priority order
    for (const field of QUESTION_PRIORITY) {
      if (missingFields.includes(field)) {
        return field;
      }
    }

    // Default to first missing field
    return missingFields[0];
  }

  /**
   * Generate a contextual question using AI or fallback
   */
  private async generateContextualQuestion(
    context: ConversationContext,
    field: keyof IntelligentCriteria,
  ): Promise<string> {
    // Try AI-generated question
    try {
      const question = await this.generateWithAI(context, field);
      if (question) {
        return question;
      }
    } catch (error) {
      this.logger.warn('AI question generation failed, using fallback', error);
    }

    // Fallback to static questions
    return this.getFallbackQuestion(field, context.criteria);
  }

  /**
   * Generate question using AI
   */
  private async generateWithAI(
    context: ConversationContext,
    field: keyof IntelligentCriteria,
  ): Promise<string | null> {
    if (!this.aiProvider.isAvailable) {
      return null;
    }

    const knownContext = this.describeKnownContext(context.criteria);
    const fieldDescription = this.getFieldDescription(field);

    const prompt = `You are a friendly project setup assistant having a natural conversation.

${knownContext ? `What we know so far:\n${knownContext}` : 'This is the start of our conversation.'}

Generate a SHORT, natural follow-up question to learn about: ${fieldDescription}

RULES:
- Be conversational, not formal
- ONE question only
- Offer 2-3 options when helpful
- Reference what they already told you (if anything)
- Max 2 sentences
- Don't ask about things we already know

EXAMPLES OF GOOD QUESTIONS:
- "For a healthcare website, how many people on your team?"
- "Do you prefer working in sprints, or more of a continuous flow where tasks move through stages?"
- "Will clients or external stakeholders need access to this project?"
- "What's your timeline looking like - a quick 1-3 month project, or something longer?"

Just respond with the question, nothing else.`;

    const response = await this.aiProvider.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 100,
      temperature: 0.7,
    });

    return response?.content?.trim() || null;
  }

  /**
   * Get fallback question for a field
   */
  private getFallbackQuestion(
    field: keyof IntelligentCriteria,
    criteria: IntelligentCriteria,
  ): string {
    // Special handling for description when we already have a name
    if (field === 'description' && criteria.projectName) {
      return `Great name! Tell me what ${criteria.projectName} will do - what problem does it solve?`;
    }

    // Special handling for projectType when we have name and description
    if (
      field === 'projectType' &&
      criteria.projectName &&
      criteria.description
    ) {
      return `What type of project is ${criteria.projectName}? (mobile app, website, software, etc.)`;
    }

    // NEW: Special handling for industry - use context-aware questions
    if (field === 'industry') {
      // If we know the project type, ask more specific industry question
      if (criteria.projectType) {
        const typeKey = criteria.projectType.toLowerCase().replace(/_/g, '_');
        const specificQuestion = INDUSTRY_QUESTIONS_BY_TYPE[typeKey];
        if (specificQuestion) {
          // Add project name context if known
          if (criteria.projectName) {
            return specificQuestion.replace(
              'your',
              `${criteria.projectName}'s`,
            );
          }
          return specificQuestion;
        }
      }
      // Fall back to default industry question with project name context
      if (criteria.projectName) {
        return `What industry is ${criteria.projectName} for? Healthcare, fintech, e-commerce, education, or something else?`;
      }
      return INDUSTRY_QUESTIONS_BY_TYPE.default;
    }

    // Get base question
    const base =
      FALLBACK_QUESTIONS[field] ||
      `Could you tell me more about your ${field}?`;

    // Add project name context if known
    if (
      criteria.projectName &&
      field !== 'projectName' &&
      field !== 'description'
    ) {
      return base.replace('this project', criteria.projectName);
    }

    // Add project type context if known
    if (criteria.projectType && field !== 'projectType') {
      const projectDesc = criteria.projectType.replace('_', ' ');
      return base.replace('project', `${projectDesc} project`);
    }

    return base;
  }

  /**
   * Describe what we know so far
   */
  private describeKnownContext(criteria: IntelligentCriteria): string {
    const parts: string[] = [];

    if (criteria.projectType) {
      parts.push(`Project type: ${criteria.projectType.replace('_', ' ')}`);
    }
    if (criteria.teamSize) {
      parts.push(
        `Team size: ${criteria.teamSize === '1' ? 'solo' : criteria.teamSize + ' people'}`,
      );
    }
    if (criteria.workStyle) {
      parts.push(`Work style: ${criteria.workStyle}`);
    }
    if (criteria.timeline) {
      parts.push(`Timeline: ${criteria.timeline}`);
    }
    if (criteria.industry) {
      parts.push(`Industry: ${criteria.industry}`);
    }
    if (criteria.hasExternalStakeholders) {
      parts.push(`Working with external stakeholders`);
    }

    return parts.join('\n');
  }

  /**
   * Get human-readable description of a field
   */
  private getFieldDescription(field: keyof IntelligentCriteria): string {
    const descriptions: Record<string, string> = {
      projectType: 'what type of project they are building',
      teamSize: 'how many people are on their team',
      workStyle: 'how they prefer to work (sprints, kanban, etc.)',
      hasExternalStakeholders:
        'whether they work with clients or external stakeholders',
      timeline: 'their expected project timeline',
      industry: 'what industry they are in',
    };

    return descriptions[field] || field;
  }

  /**
   * Generate a confirmation message summarizing what we understood
   */
  generateConfirmation(criteria: IntelligentCriteria): string {
    const parts: string[] = [];

    if (criteria.projectName) {
      parts.push(`Building: **${criteria.projectName}**`);
    }
    if (criteria.projectType) {
      parts.push(`Type: ${criteria.projectType.replace('_', ' ')}`);
    }
    if (criteria.teamSize) {
      parts.push(
        `Team: ${criteria.teamSize === '1' ? 'Solo' : criteria.teamSize + ' people'}`,
      );
    }
    if (criteria.workStyle) {
      parts.push(`Workflow: ${criteria.workStyle}`);
    }
    if (criteria.timeline) {
      const timelineDesc = {
        short: '1-3 months',
        medium: '3-6 months',
        long: '6+ months',
      };
      parts.push(`Timeline: ${timelineDesc[criteria.timeline]}`);
    }
    if (criteria.hasExternalStakeholders) {
      parts.push(`Working with: External stakeholders/clients`);
    }

    if (parts.length === 0) {
      return 'Great! I have some recommendations for you. 👇';
    }

    return `Perfect! Based on what you've told me:\n${parts.map((p) => `• ${p}`).join('\n')}\n\nHere are my recommendations 👇`;
  }

  /**
   * Generate a name confirmation question with suggested name
   */
  generateNameConfirmationQuestion(
    suggestedName: string,
    alternatives?: string[],
  ): string {
    if (alternatives && alternatives.length > 0) {
      const allNames = [suggestedName, ...alternatives.slice(0, 2)];
      return `Based on your project, how about one of these names: **${allNames[0]}**, ${allNames
        .slice(1)
        .map((n) => `**${n}**`)
        .join(', or ')}? Or type a different name if you prefer.`;
    }
    return `Based on your project, how about calling it **"${suggestedName}"**? Or type a different name if you prefer.`;
  }

  /**
   * Generate a question asking for project name
   */
  generateProjectNameQuestion(context: ConversationContext): string {
    const projectType =
      context.criteria.projectType?.replace('_', ' ') || 'project';
    return `What would you like to call this ${projectType}?`;
  }

  /**
   * Generate a question asking for description (when name was skipped)
   */
  generateDescriptionQuestion(context: ConversationContext): string {
    const projectType =
      context.criteria.projectType?.replace('_', ' ') || 'project';
    return `No problem! Tell me more about what this ${projectType} will do - that'll help me suggest a good name.`;
  }
}
