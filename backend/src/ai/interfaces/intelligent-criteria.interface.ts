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
 * Experience levels for user experience matching
 */
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * Stakeholder types for external work detection
 */
export type StakeholderType = 'client' | 'partner' | 'public' | 'internal';

/**
 * Conversation phases for smart name flow
 */
export type ConversationPhase =
  | 'initial' // First message received
  | 'gathering_context' // Getting project type and description
  | 'name_needed' // Context gathered, need to generate name
  | 'name_confirmation' // AI generated name, awaiting user confirmation
  | 'gathering_details' // Name confirmed, getting team size, workflow, etc.
  | 'ready'; // All criteria gathered, ready for recommendation

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

  // External stakeholder detection
  hasExternalStakeholders: boolean;
  stakeholderType?: StakeholderType;

  // Industry vertical
  industry?: string | null;
  complianceNeeds?: string[];

  // ============================================
  // User context - NEW!
  // ============================================
  experienceLevel?: ExperienceLevel | null;

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

  // NEW: Conversation phase for smart name flow
  phase: ConversationPhase;

  // NEW: Name generation state
  nameGenerationAttempts: number;
  pendingNameSuggestions?: string[];
  userSkippedName?: boolean;
}

/**
 * Result from semantic extraction
 */
export interface ExtractionResult {
  criteria: IntelligentCriteria;
  confidence: CriteriaConfidence;
  newlyExtracted: string[]; // Fields extracted in this turn
  skipIntents?: string[]; // NEW: Fields where user indicated "skip" or "I don't know"
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
    complexityFit: number; // NEW: replaces popularity
    userPreference: number;
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
 * Required fields for making a recommendation AND creating a project
 * Order matters: this is the priority order for asking questions
 *
 * Updated: Added 'industry' after 'description' for better template matching
 * with the new 8-industry system (healthcare, fintech, etc.)
 */
export const REQUIRED_CRITERIA: (keyof IntelligentCriteria)[] = [
  'projectName', // 1. Ask name first
  'description', // 2. Description required for project creation
  'industry', // 3. NEW: Industry for template matching (healthcare, fintech, etc.)
  'projectType', // 4. Type helps with template matching
  'teamSize', // 5. Team size for workflow recommendation
  'workStyle', // 6. Workflow preference last
];

/**
 * Question priority order - includes industry for smart questioning
 *
 * Flow: Name → Description → Industry → ProjectType → TeamSize → WorkStyle
 */
export const QUESTION_PRIORITY: (keyof IntelligentCriteria)[] = [
  'projectName',
  'description',
  'industry', // NEW: Ask industry early to match with 19 templates
  'projectType',
  'teamSize',
  'workStyle',
  'hasExternalStakeholders',
  'timeline',
];
