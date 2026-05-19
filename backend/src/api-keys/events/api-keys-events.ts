/**
 * API Key Event Payloads — Typed Contracts for Event-Driven Architecture
 *
 * These interfaces define the shape of events emitted by the api-keys
 * module (today: command service after every mutation, plus the
 * cleanup cron for `EXPIRED` and `UNUSED_DETECTED`). Future consumers
 * — webhooks, anomaly-detection workers, the upcoming partner
 * ingestion pipeline — subscribe via `@OnEvent(API_KEY_EVENTS.CREATED)`
 * and receive strongly-typed payloads built from value-object DTOs.
 * The raw TypeORM `ApiKey` entity is NEVER carried on an event —
 * `keyHash` and the joined `User` would leak through the event bus
 * otherwise.
 *
 * EVENT NAMING CONVENTION
 *   api_key.created            — A new API key was issued
 *   api_key.revoked            — A key was permanently deleted
 *   api_key.updated            — Name and/or scopes were changed
 *   api_key.rotated            — Replacement key issued, old scheduled for revoke
 *   api_key.expired            — Validator observed an expired key on the hot path
 *   api_key.validation_failed  — Hash mismatch / unknown prefix / past grace
 *   api_key.ip_denied          — IP allowlist enforcement blocked a request
 *   api_key.unused_detected    — Cleanup cron flagged a key as unused
 *   api_key.purged             — Cleanup cron permanently removed an expired key
 *
 * TIMING: All mutation events are emitted AFTER the DB write succeeds.
 * Validator-driven events (`expired`, `validation_failed`, `ip_denied`)
 * are emitted alongside the corresponding audit log entry — these are
 * authentication-failure signals, not state transitions, but the
 * payload shape stays consistent so the same consumers can subscribe.
 *
 * AUDIT vs EVENTS: `IApiKeyAuditLogger` writes PCI-DSS compliant rows
 * to the audit log table. The event bus is for in-process listeners
 * (webhooks, anomaly probes) that need to react in real time without
 * tailing the audit table. The two emission paths fire from the same
 * call sites so they never desynchronise.
 *
 * @see api-key-command.service.ts (Step 3) for mutation emission points
 * @see api-key-validator.service.ts (Step 3) for hot-path emission points
 * @see api-key-cleanup.service.ts (Step 3) for cron emission points
 */

import type {
  ApiKeySummary,
  ApiKeyValidationContext,
  ValidatedApiKey,
} from '../interfaces/api-keys.interfaces';

// =============================================================================
// EVENT NAME CONSTANTS
// =============================================================================

/**
 * Event-name constants to prevent typos in emitter/subscriber
 * coupling. Use these instead of raw strings.
 */
export const API_KEY_EVENTS = {
  CREATED: 'api_key.created',
  REVOKED: 'api_key.revoked',
  UPDATED: 'api_key.updated',
  ROTATED: 'api_key.rotated',
  EXPIRED: 'api_key.expired',
  VALIDATION_FAILED: 'api_key.validation_failed',
  IP_DENIED: 'api_key.ip_denied',
  UNUSED_DETECTED: 'api_key.unused_detected',
  PURGED: 'api_key.purged',
} as const;

export type ApiKeyEventName =
  (typeof API_KEY_EVENTS)[keyof typeof API_KEY_EVENTS];

// =============================================================================
// SHARED VALUE OBJECTS
// =============================================================================

/**
 * Lightweight actor projection embedded inside event payloads. Mirrors
 * the audit-side `ActorContext` but readonly and stripped of fields
 * the event bus shouldn't propagate (no `sessionId` — that lives in
 * the audit table only).
 */
export interface ApiKeyEventActor {
  readonly userId: string;
  readonly organizationId: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

// =============================================================================
// MUTATION EVENT PAYLOADS — emitted by ApiKeyCommandService
// =============================================================================

/**
 * Fields shared by every command-emitted event. `timestamp` is the
 * moment the DB write committed (not the moment the event was
 * dispatched), so consumers can deduplicate / order events
 * deterministically.
 */
interface BaseApiKeyMutationEvent {
  readonly key: ApiKeySummary;
  readonly actor: ApiKeyEventActor;
  readonly timestamp: Date;
}

/** Emitted after a new API key is successfully created. */
export type ApiKeyCreatedEvent = BaseApiKeyMutationEvent;

/**
 * Emitted after a key is permanently deleted. Carries the final
 * snapshot of the key (so listeners can record the prefix/scopes
 * without a follow-up query) plus the optional human-supplied reason.
 */
export interface ApiKeyRevokedEvent extends BaseApiKeyMutationEvent {
  readonly reason: string | null;
}

/**
 * Emitted after name and/or scopes change. `changes` mirrors the
 * audit-log diff shape so listeners can render a delta without
 * inspecting the before/after snapshots themselves.
 */
export interface ApiKeyUpdatedEvent extends BaseApiKeyMutationEvent {
  readonly changes: ReadonlyArray<{
    readonly field: string;
    readonly oldValue: unknown;
    readonly newValue: unknown;
  }>;
}

/**
 * Emitted after a rotation transaction commits. Carries both keys so
 * listeners can drive rotation-history UI and alerting from a single
 * payload.
 */
export interface ApiKeyRotatedEvent {
  readonly oldKey: ApiKeySummary;
  readonly newKey: ApiKeySummary;
  readonly revokeAt: Date;
  readonly actor: ApiKeyEventActor;
  readonly timestamp: Date;
}

// =============================================================================
// HOT-PATH EVENT PAYLOADS — emitted by ApiKeyValidatorService
// =============================================================================

/**
 * Emitted when the validator observes an expired key on the hot path.
 * Carries the sanitized `ValidatedApiKey` so subscribers can identify
 * the owner without touching the entity.
 */
export interface ApiKeyExpiredEvent {
  readonly key: ValidatedApiKey;
  readonly context: ApiKeyValidationContext;
  readonly timestamp: Date;
}

/**
 * Emitted on every failed validation attempt (unknown prefix, hash
 * mismatch, past grace window). `keyPrefix` is the prefix the caller
 * presented — never the full plaintext key.
 */
export interface ApiKeyValidationFailedEvent {
  readonly keyPrefix: string;
  readonly reason: string;
  readonly context: ApiKeyValidationContext;
  readonly timestamp: Date;
}

/**
 * Emitted when IP allowlist enforcement blocks a request. `deniedIp`
 * is the source IP the guard observed; `key.allowedIps` is the
 * configured allowlist that rejected it.
 */
export interface ApiKeyIpDeniedEvent {
  readonly key: ValidatedApiKey;
  readonly deniedIp: string;
  readonly context: ApiKeyValidationContext;
  readonly timestamp: Date;
}

// =============================================================================
// CRON EVENT PAYLOADS — emitted by ApiKeyCleanupService
// =============================================================================

/**
 * Emitted when the daily cleanup job detects a key that has not been
 * used within the unused-key threshold. The notifications module
 * subscribes to drive the "unused key" reminder email.
 */
export interface ApiKeyUnusedDetectedEvent {
  readonly key: ApiKeySummary;
  readonly daysUnused: number;
  readonly timestamp: Date;
}

/**
 * Emitted after the cleanup job permanently deletes an expired key.
 * Listeners use this to invalidate caches and drive history UI.
 */
export interface ApiKeyPurgedEvent {
  readonly key: ApiKeySummary;
  readonly timestamp: Date;
}

// =============================================================================
// UNION TYPE
// =============================================================================

/**
 * Union of every event the api-keys module emits. Use the individual
 * event types on `@OnEvent` handler parameters to preserve semantic
 * intent at the consumer site; the union is here for exhaustive
 * pattern-matching in cross-cutting listeners (e.g., a webhook
 * dispatcher that forwards every api-key event).
 */
export type ApiKeyEvent =
  | ApiKeyCreatedEvent
  | ApiKeyRevokedEvent
  | ApiKeyUpdatedEvent
  | ApiKeyRotatedEvent
  | ApiKeyExpiredEvent
  | ApiKeyValidationFailedEvent
  | ApiKeyIpDeniedEvent
  | ApiKeyUnusedDetectedEvent
  | ApiKeyPurgedEvent;
