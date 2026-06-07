/**
 * Multi-tenant cache configuration. Keys are part of the wire contract —
 * existing live Redis state depends on them, so they MUST NOT change.
 */
export const CACHE_CONFIG = {
  L1_TTL_MS: 5 * 1000,
  L1_MAX_SIZE: 500,
  L2_TTL_SECONDS: 60,
  NAMESPACE: 'access-control',
  KEYS: {
    GLOBAL_RULES: 'global-rules',
    ORG_RULES_PREFIX: 'org-rules:',
    MERGED_RULES_PREFIX: 'merged-rules:',
    EMERGENCY_RULES: 'emergency-rules',
    ALL_RULES_PREFIX: 'all-rules:',
  },
} as const;
