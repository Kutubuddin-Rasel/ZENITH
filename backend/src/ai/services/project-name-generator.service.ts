/**
 * Project Name Generator Service
 * Generates meaningful project names from context (description, type, industry)
 */

import { Injectable, Logger } from '@nestjs/common';
import { AIProviderService } from './ai-provider.service';
import { ProjectCategory } from '../../project-templates/entities/project-template.entity';

/**
 * Random name components for fallback generation
 */
const NAME_COMPONENTS = {
  prefixes: {
    [ProjectCategory.SOFTWARE_DEVELOPMENT]: [
      'Code',
      'Dev',
      'Tech',
      'App',
      'Sync',
      'Logic',
    ],
    [ProjectCategory.WEBSITE_DEVELOPMENT]: [
      'Web',
      'Site',
      'Page',
      'Portal',
      'Hub',
      'Net',
    ],
    [ProjectCategory.MOBILE_DEVELOPMENT]: [
      'Mobile',
      'App',
      'Pocket',
      'Swift',
      'Touch',
      'Go',
    ],
    [ProjectCategory.MARKETING]: [
      'Brand',
      'Buzz',
      'Launch',
      'Reach',
      'Grow',
      'Impact',
    ],
    [ProjectCategory.DESIGN]: [
      'Design',
      'Creative',
      'Pixel',
      'Studio',
      'Craft',
      'Visual',
    ],
    [ProjectCategory.DATA_ANALYSIS]: [
      'Data',
      'Insight',
      'Analytics',
      'Metrics',
      'Chart',
      'Stats',
    ],
    [ProjectCategory.RESEARCH]: [
      'Research',
      'Study',
      'Discovery',
      'Lab',
      'Explore',
      'Quest',
    ],
    [ProjectCategory.SALES]: [
      'Sales',
      'Deal',
      'Pipeline',
      'Revenue',
      'Growth',
      'Prospect',
    ],
    [ProjectCategory.PRODUCT_LAUNCH]: [
      'Launch',
      'Release',
      'Debut',
      'Premier',
      'Intro',
      'Rollout',
    ],
    [ProjectCategory.EVENT_PLANNING]: [
      'Event',
      'Gather',
      'Summit',
      'Meet',
      'Connect',
      'Unite',
    ],
    default: ['Project', 'Work', 'Task', 'Plan', 'Build', 'Create'],
  },
  suffixes: [
    'Hub',
    'Pro',
    'Flow',
    'Track',
    'Desk',
    'Base',
    'Cloud',
    'Space',
    'Works',
    'Lab',
  ],
  adjectives: [
    'Smart',
    'Fast',
    'Easy',
    'Quick',
    'Prime',
    'Core',
    'Max',
    'Plus',
    'Elite',
    'Pro',
  ],
};

@Injectable()
export class ProjectNameGeneratorService {
  private readonly logger = new Logger(ProjectNameGeneratorService.name);

  constructor(private readonly aiProvider: AIProviderService) {}

  /**
   * Generate project name suggestions from description and context
   * Returns 2-3 name suggestions
   */
  async generateFromContext(
    description: string | null,
    projectType: ProjectCategory | null,
    industry?: string | null,
  ): Promise<string[]> {
    // Try AI generation first
    if (
      this.aiProvider.isAvailable &&
      (description || projectType || industry)
    ) {
      try {
        const names = await this.generateWithAI(
          description,
          projectType,
          industry,
        );
        if (names.length > 0) {
          return names;
        }
      } catch (error) {
        this.logger.warn('AI name generation failed, using fallback', error);
      }
    }

    // Fallback to random generation
    return [this.generateRandom(projectType), this.generateRandom(projectType)];
  }

  /**
   * Generate project name using AI
   */
  private async generateWithAI(
    description: string | null,
    projectType: ProjectCategory | null,
    industry?: string | null,
  ): Promise<string[]> {
    const contextParts: string[] = [];

    if (description) {
      contextParts.push(`Description: ${description}`);
    }
    if (projectType) {
      contextParts.push(`Project Type: ${projectType.replace('_', ' ')}`);
    }
    if (industry) {
      contextParts.push(`Industry: ${industry}`);
    }

    if (contextParts.length === 0) {
      return [];
    }

    const prompt = `Generate 2-3 creative, memorable project names based on this context:

${contextParts.join('\n')}

RULES:
- Names should be 1-2 words, easy to say and remember
- Use CamelCase or single words (e.g., "BakeryStock", "HealthTrack", "CodeFlow")
- Be creative but professional
- No generic names like "MyProject" or "NewApp"
- Names should hint at the project's purpose

Respond with ONLY the names, one per line, nothing else.`;

    const response = await this.aiProvider.complete({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 50,
      temperature: 0.8,
    });

    if (!response?.content) {
      return [];
    }

    // Parse response - each line is a name
    const names = response.content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.length <= 30)
      .filter((line) => /^[A-Za-z][A-Za-z0-9]*$/.test(line)) // Valid identifier
      .slice(0, 3);

    return names;
  }

  /**
   * Generate a random but contextual name when no context is available
   */
  generateRandom(projectType: ProjectCategory | null): string {
    // Get prefixes with proper type handling
    const prefixMap = NAME_COMPONENTS.prefixes as Record<string, string[]>;
    const prefixes: string[] = projectType
      ? prefixMap[projectType] || prefixMap['default']
      : prefixMap['default'];

    const useAdjective = Math.random() > 0.5;
    const useSuffix = Math.random() > 0.3;

    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];

    if (useAdjective) {
      const adjective =
        NAME_COMPONENTS.adjectives[
          Math.floor(Math.random() * NAME_COMPONENTS.adjectives.length)
        ];
      return `${adjective}${prefix}`;
    }

    if (useSuffix) {
      const suffix =
        NAME_COMPONENTS.suffixes[
          Math.floor(Math.random() * NAME_COMPONENTS.suffixes.length)
        ];
      return `${prefix}${suffix}`;
    }

    return prefix;
  }

  /**
   * Generate a URL-friendly slug from project name
   */
  generateSlug(name: string): string {
    return name
      .replace(/([a-z])([A-Z])/g, '$1-$2') // CamelCase to kebab
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with dash
      .replace(/^-|-$/g, ''); // Remove leading/trailing dashes
  }

  /**
   * Validate a project name
   */
  isValidName(name: string): boolean {
    if (!name || name.length < 2 || name.length > 50) {
      return false;
    }
    // Must start with letter, can contain letters, numbers, spaces, dashes
    return /^[A-Za-z][A-Za-z0-9\s-]*$/.test(name);
  }

  /**
   * Normalize user-provided name
   */
  normalizeName(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }
}
