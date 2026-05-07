export interface ActiveTimerPayload {
  userId: string;
  issueId: string;
  projectId: string;
  startedAt: string;
}

export interface TimerStatus {
  userId: string;
  issueId: string;
  projectId: string;
  startedAt: string;
  elapsedMs: number;
  elapsedMinutes: number;
}

export interface BillingSummary {
  totalMinutes: number;
  billableMinutes: number;
  amountCents: number;
  formattedAmount: string;
  currency: string;
}

export const TIMER_KEY_PREFIX = 'timer:user:';
export const TIMER_NAMESPACE = 'timers';
export const TIMER_TTL_SECONDS = 60 * 60 * 24;

export function buildTimerKey(userId: string): string {
  return `${TIMER_KEY_PREFIX}${userId}`;
}
