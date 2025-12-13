/**
 * Intelligent Criteria Interface
 * Enhanced criteria types for Smart Setup AI with confidence tracking
 */

import {
  ProjectCategory,
  ProjectMethodology,
} from '../../project-templates/entities/project-template.entity';

/**
 * Team size ranges
 */
export type TeamSizeRange = '1' | '2-5' | '6-10' | '11-20' | '20+';

/**
 * Timeline durations
 */
export type TimelineRange = 'short' | 'medium' | 'long';

/**
 * Stakeholder types for external work detection
 */
export type StakeholderType = 'client' | 'partner' | 'public' | 'internal';

/**
 * Enhanced criteria extracted from conversation
 * Includes external stakeholder detection and confidence tracking
 */
export interface IntelligentCriteria {
  // ============================================
  // Core (required for recommendation)
  // ============================================
  projectType: ProjectCategory | null;
  teamSize: TeamSizeRange | null;
  workStyle: ProjectMethodology | null;

  // ============================================
  // Enhanced context (improves accuracy)
  // ============================================
  projectName?: string | null;
  description?: string | null;
  timeline?: TimelineRange | null;

  // External stakeholder detection - NEW!
  hasExternalStakeholders: boolean;
  stakeholderType?: StakeholderType;

  // Industry vertical
  industry?: string | null;
  complianceNeeds?: string[];

  // ============================================
  // Inferred preferences
  // ============================================
  wantsApprovalWorkflow: boolean;
  wantsTimeTracking?: boolean;
  wantsStoryPoints?: boolean;

  // ============================================
  // Features
  // ============================================
  keyFeatures: string[];
  excludedFeatures: string[];
}

/**
 * Confidence tracking per field
 */
export interface CriteriaConfidence {
  projectType: number;
  teamSize: number;
  workStyle: number;
  timeline: number;
  hasExternalStakeholders: number;
  industry: number;
  overall: number;
}

/**
 * Single message in conversation
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  extractedData?: Partial<IntelligentCriteria>;
}

/**
 * User correction tracking for learning
 */
export interface CriteriaCorrection {
  field: keyof IntelligentCriteria;
  originalValue: unknown;
  correctedValue: unknown;
  timestamp: Date;
}

/**
 * Full conversation context stored in Redis
 */
export interface ConversationContext {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;

  // Full message history
  messages: ConversationMessage[];

  // Accumulated extracted criteria
  criteria: IntelligentCriteria;

  // Confidence per field
  confidence: CriteriaConfidence;

  // Questions already asked (prevent repeats)
  askedQuestions: string[];

  // User corrections (for learning)
  corrections: CriteriaCorrection[];

  // Metadata
  turnCount: number;
  lastActivityAt: Date;
}

/**
 * Result from semantic extraction
 */
export interface ExtractionResult {
  criteria: IntelligentCriteria;
  confidence: CriteriaConfidence;
  newlyExtracted: string[]; // Fields extracted in this turn
}

/**
 * Template scoring result
 */
export interface TemplateScoringResult {
  templateId: string;
  score: number;
  confidence: number;
  reasons: string[];
  breakdown: {
    categoryMatch: number;
    methodologyMatch: number;
    teamSizeFit: number;
    stakeholderFit: number;
    industryMatch: number;
    userPreference: number;
    popularity: number;
  };
}

/**
 * Factory function for empty criteria
 */
export function createEmptyCriteria(): IntelligentCriteria {
  return {
    projectType: null,
    teamSize: null,
    workStyle: null,
    projectName: null,
    description: null,
    timeline: null,
    hasExternalStakeholders: false,
    stakeholderType: undefined,
    industry: null,
    complianceNeeds: [],
    wantsApprovalWorkflow: false,
    wantsTimeTracking: undefined,
    wantsStoryPoints: undefined,
    keyFeatures: [],
    excludedFeatures: [],
  };
}

/**
 * Factory function for empty confidence
 */
export function createEmptyConfidence(): CriteriaConfidence {
  return {
    projectType: 0,
    teamSize: 0,
    workStyle: 0,
    timeline: 0,
    hasExternalStakeholders: 0,
    industry: 0,
    overall: 0,
  };
}

/**
 * Required fields for making a recommendation
 */
export const REQUIRED_CRITERIA: (keyof IntelligentCriteria)[] = [
  'projectType',
  'teamSize',
  'workStyle',
];

/**
 * Question priority order
 */
export const QUESTION_PRIORITY: (keyof IntelligentCriteria)[] = [
  'projectType',
  'teamSize',
  'workStyle',
  'hasExternalStakeholders',
  'timeline',
];
