/**
 * Industry Constants
 * Defines supported industries with aliases for AI matching
 */

/**
 * Team size label type
 */
export type TeamSizeLabel =
  | 'solo'
  | 'small'
  | 'medium'
  | 'large'
  | 'enterprise';

/**
 * Ideal team size configuration
 */
export interface IdealTeamSize {
  min: number;
  max: number;
  label: TeamSizeLabel;
}

/**
 * Template feature flags
 */
export interface TemplateFeatures {
  hasApprovalWorkflow: boolean;
  supportsExternalStakeholders: boolean;
  hasSprintPlanning: boolean;
  hasTimeTracking: boolean;
  hasStoryPoints: boolean;
}

/**
 * Template complexity levels
 */
export type TemplateComplexity = 'simple' | 'medium' | 'complex';

/**
 * Industry definition with matching aliases
 */
export interface IndustryDefinition {
  id: string;
  label: string;
  aliases: string[];
}

/**
 * Supported industries with aliases for AI matching
 * These aliases help match user input like "healthcare startup" to the right industry
 */
export const INDUSTRIES: Record<string, IndustryDefinition> = {
  TECHNOLOGY: {
    id: 'technology',
    label: 'Technology & Software',
    aliases: [
      'tech',
      'software',
      'saas',
      'it',
      'digital',
      'app',
      'platform',
      'api',
      'web',
      'cloud',
    ],
  },
  HEALTHCARE: {
    id: 'healthcare',
    label: 'Healthcare & Medical',
    aliases: [
      'medical',
      'health',
      'hospital',
      'clinic',
      'patient',
      'pharma',
      'doctor',
      'nurse',
      'hipaa',
    ],
  },
  FINTECH: {
    id: 'fintech',
    label: 'Finance & Fintech',
    aliases: [
      'finance',
      'banking',
      'insurance',
      'trading',
      'payments',
      'investment',
      'crypto',
      'loan',
      'accounting',
    ],
  },
  ECOMMERCE: {
    id: 'ecommerce',
    label: 'E-commerce & Retail',
    aliases: [
      'retail',
      'shop',
      'store',
      'marketplace',
      'inventory',
      'product',
      'shopping',
      'cart',
      'order',
    ],
  },
  EDUCATION: {
    id: 'education',
    label: 'Education & EdTech',
    aliases: [
      'edtech',
      'school',
      'university',
      'learning',
      'course',
      'lms',
      'student',
      'teacher',
      'training',
    ],
  },
  AGENCY: {
    id: 'agency',
    label: 'Agency & Consulting',
    aliases: [
      'consulting',
      'services',
      'client',
      'creative',
      'studio',
      'agency',
      'freelance',
      'contractor',
    ],
  },
  STARTUP: {
    id: 'startup',
    label: 'Startup & General',
    aliases: [
      'general',
      'business',
      'mvp',
      'side-project',
      'personal',
      'new',
      'idea',
      'venture',
    ],
  },
  ENTERPRISE: {
    id: 'enterprise',
    label: 'Enterprise & Corporate',
    aliases: [
      'corporate',
      'large',
      'organization',
      'company',
      'enterprise',
      'department',
      'team',
    ],
  },
} as const;

/**
 * Industry ID type derived from INDUSTRIES constant
 */
export type IndustryId = keyof typeof INDUSTRIES;

/**
 * Get all industry IDs as lowercase strings (for template matching)
 */
export function getIndustryIds(): string[] {
  return Object.values(INDUSTRIES).map((ind) => ind.id);
}

/**
 * Match user input to an industry using alias matching
 * @param input User's message or description
 * @returns Matched industry ID or null
 */
export function matchIndustry(input: string): string | null {
  if (!input) return null;

  const lower = input.toLowerCase();

  // Check each industry's aliases
  for (const industry of Object.values(INDUSTRIES)) {
    if (industry.aliases.some((alias) => lower.includes(alias))) {
      return industry.id;
    }
  }

  return null;
}

/**
 * Get all matching industries from input (may match multiple)
 * @param input User's message or description
 * @returns Array of matched industry IDs
 */
export function matchAllIndustries(input: string): string[] {
  if (!input) return [];

  const lower = input.toLowerCase();
  const matches: string[] = [];

  for (const industry of Object.values(INDUSTRIES)) {
    if (industry.aliases.some((alias) => lower.includes(alias))) {
      matches.push(industry.id);
    }
  }

  return matches;
}

/**
 * Get industry label by ID
 */
export function getIndustryLabel(id: string): string | null {
  for (const industry of Object.values(INDUSTRIES)) {
    if (industry.id === id) {
      return industry.label;
    }
  }
  return null;
}

/**
 * Default features when not specified
 */
export const DEFAULT_FEATURES: TemplateFeatures = {
  hasApprovalWorkflow: false,
  supportsExternalStakeholders: false,
  hasSprintPlanning: false,
  hasTimeTracking: false,
  hasStoryPoints: false,
};

/**
 * Team size presets for easy assignment
 */
export const TEAM_SIZE_PRESETS: Record<string, IdealTeamSize> = {
  SOLO: { min: 1, max: 1, label: 'solo' },
  TINY: { min: 1, max: 3, label: 'solo' },
  SMALL: { min: 2, max: 10, label: 'small' },
  MEDIUM: { min: 5, max: 25, label: 'medium' },
  LARGE: { min: 15, max: 50, label: 'large' },
  ENTERPRISE: { min: 30, max: 500, label: 'enterprise' },
};
