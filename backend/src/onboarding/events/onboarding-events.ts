/**
 * Onboarding Event Payloads — Typed Contracts for PLG Hooks.
 *
 * Emitted AFTER the DB write succeeds so listeners (analytics, gamification,
 * lifecycle emails) never observe phantom progress.
 *
 * @see OnboardingService for emission points
 */

export const ONBOARDING_EVENTS = {
  STEP_COMPLETED: 'onboarding.step.completed',
  COMPLETED: 'onboarding.completed',
} as const;

interface BaseOnboardingEvent {
  readonly userId: string;
  readonly projectId?: string;
  readonly timestamp: Date;
}

export interface OnboardingStepCompletedEvent extends BaseOnboardingEvent {
  readonly stepId: string;
}

export type OnboardingCompletedEvent = BaseOnboardingEvent;
