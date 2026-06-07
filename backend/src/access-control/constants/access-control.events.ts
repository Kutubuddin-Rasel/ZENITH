export const ACCESS_CONTROL_EVENTS = {
  RULES_CHANGED: 'access-control.rules-changed',
} as const;

export interface RulesChangedEvent {
  ruleId?: string;
  organizationId?: string | null;
  action: 'created' | 'updated' | 'deleted' | 'expired-cleanup';
}
