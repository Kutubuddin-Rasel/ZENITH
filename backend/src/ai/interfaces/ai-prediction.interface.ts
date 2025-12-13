/**
 * AI Triage Prediction Types
 * Types for confidence-based AI triage suggestions
 */

import { IssuePriority } from '../../issues/entities/issue.entity';

/**
 * Confidence thresholds for AI predictions
 */
export enum ConfidenceThreshold {
  /** Auto-apply without user confirmation */
  AUTO_APPLY = 0.95,
  /** Show suggestion UI for user review */
  SUGGEST = 0.75,
  /** Too uncertain, discard prediction */
  DISCARD = 0.5,
}

/**
 * AI prediction result from triage analysis
 */
export interface AIPrediction {
  /** Predicted priority */
  priority?: IssuePriority;
  /** Predicted labels */
  labels?: string[];
  /** Confidence score 0.0 - 1.0 */
  confidence: number;
  /** AI reasoning for the prediction */
  reasoning?: string;
  /** Model used for prediction */
  model?: string;
}

/**
 * Status of an AI suggestion
 */
export enum AISuggestionStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

/**
 * LLM response structure for triage with confidence
 */
export interface TriageAnalysisResponse {
  priority: 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';
  labels: string[];
  confidence: number;
  reasoning: string;
}
