/**
 * API Keys Module — Abstract Contracts (ISP Surface, Step 1)
 *
 * These interfaces are the ONLY allowed coupling point between the
 * api-keys module and the rest of Zenith. The concrete services
 * (`ApiKeyCommandService`, `ApiKeyQueryService`, `ApiKeyValidatorService`,
 * `ApiKeyCryptoService`, `ApiKeyPolicyService`, `ApiKeyAuditService`),
 * the `AbstractApiKeyRepository` DIP boundary, and the persistence
 * entity `ApiKey` are implementation details that must never leak
 * across the module boundary.
 *
 * DTO Strategy
 * ------------
 * `ApiKeySummary` and `ValidatedApiKey` are pure value-object views —
 * they intentionally do NOT extend the TypeORM `ApiKey` entity so
 * consumers cannot accidentally depend on ORM metadata, lifecycle
 * decorators, lazy relations, or — critically — the `keyHash` field.
 *
 *   `keyHash` is module-internal. It MUST NOT appear on any DTO that
 *   crosses this barrier. The plaintext key is shown to the caller
 *   exactly ONCE (on create + rotate) via `ApiKeyCreateResult` /
 *   `ApiKeyRotateResult` and never persisted in any other shape.
 *
 * Segregation Rationale (ISP)
 * ---------------------------
 *  - `IApiKeyCommand` / `IApiKeyQuery` split keeps the read-heavy
 *    dashboard surface decoupled from the mutating CRUD surface
 *    (mirrors `IInviteQuery` / `IInviteCommand`).
 *  - `IApiKeyValidator` is the single hot-path API consumed by
 *    `ApiKeyGuard` — segregated from query/command so guard changes
 *    can never widen the surface a controller depends on.
 *  - `IApiKeyCryptoService` is a single-purpose seam wrapping `bcrypt`
 *    and `generateSecureToken` so deterministic tests can replace it
 *    without monkey-patching `bcrypt` or `crypto.randomBytes`.
 *  - `IApiKeyPolicy` isolates ownership / rotation / expiration rules
 *    so they can be unit-tested without the DB or the audit log
 *    (mirrors `IInvitePolicy`).
 *  - `IApiKeyAuditLogger` owns every PCI-DSS audit emission for the
 *    aggregate; it is the sole consumer of `AuditService` from inside
 *    this module.
 *
 * The repository contract `AbstractApiKeyRepository` (Step 2) lives
 * under `repositories/abstract/` — it is a module-internal DIP
 * boundary and is intentionally NOT re-exported through the barrel.
 */

// ---------------------------------------------------------------------------
// Actor & Validation Context
// ---------------------------------------------------------------------------

/**
 * PCI-DSS compliant actor description. Every mutation accepts an
 * `ActorContext` so the audit logger can record `userId`,
 * `organizationId`, network origin (`ipAddress`), client fingerprint
 * (`userAgent`), and session linkage (`sessionId`) without the command
 * service having to reach into the HTTP request shape itself.
 *
 * Migrated verbatim from `api-keys.service.ts:24` — kept structurally
 * identical so the controller body stays unchanged in Step 3.
 */
export interface ActorContext {
  readonly userId: string;
  readonly organizationId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly sessionId?: string;
}

/**
 * Network-layer context passed alongside the plaintext key on the hot
 * path. The validator forwards these fields into
 * `IApiKeyAuditLogger.logValidationFailed` / `logIpDenied` so failed
 * attempts are still attributable to a source IP / UA pair.
 */
export interface ApiKeyValidationContext {
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

// ---------------------------------------------------------------------------
// Value-Object Views (DTOs) — zero TypeORM coupling, zero keyHash
// ---------------------------------------------------------------------------

/**
 * Projection of an api_keys row safe for read paths (controller list /
 * detail endpoints, dashboards, audit replay). The `keyHash` column
 * is deliberately absent — consumers never need it, and excluding it
 * at the type level makes accidental leakage a compile error rather
 * than a runtime/PR review concern.
 */
export interface ApiKeySummary {
  readonly id: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly userId: string;
  readonly projectId: string | null;
  readonly scopes: readonly string[];
  readonly lastUsedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly rateLimit: number;
  readonly allowedIps: readonly string[] | null;
  readonly revokeAt: Date | null;
  readonly rotatedToKeyId: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Hot-path projection returned by `IApiKeyValidator.validate`. Carries
 * exactly the fields `ApiKeyGuard` needs to enforce IP allowlist,
 * rate limit, and scope checks — and to attach an identity to
 * `request.user`. The raw `ApiKey` entity (with its `keyHash`, joined
 * `User`, and ORM metadata) NEVER leaves the module through this DTO.
 *
 * `organizationId` is denormalised from the joined user at validation
 * time so the guard does not need to reach into another aggregate.
 */
export interface ValidatedApiKey {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string | null;
  readonly projectId: string | null;
  readonly keyPrefix: string;
  readonly scopes: readonly string[];
  readonly rateLimit: number;
  readonly allowedIps: readonly string[] | null;
  readonly expiresAt: Date | null;
}

// ---------------------------------------------------------------------------
// Command DTOs (input + output contracts for the write-side surface)
// ---------------------------------------------------------------------------

/**
 * Input contract for `IApiKeyCommand.create`. Mirrors the controller's
 * `CreateApiKeyDto` shape but decoupled from class-validator metadata
 * so consumers (and tests) never need to import HTTP DTO classes.
 */
export interface ApiKeyCreateCommand {
  readonly name: string;
  readonly scopes: readonly string[];
  readonly projectId?: string;
  readonly expiresAt?: string | Date;
  readonly rateLimit?: number;
  readonly allowedIps?: readonly string[] | null;
}

/**
 * Input contract for `IApiKeyCommand.update`. Both fields optional;
 * supplying neither is a no-op and the command service returns the
 * current summary without writing or emitting an audit event.
 */
export interface ApiKeyUpdateCommand {
  readonly name?: string;
  readonly scopes?: readonly string[];
}

/**
 * Input contract for `IApiKeyCommand.rotate`. `gracePeriodHours`
 * controls how long the OLD key remains valid after the new one is
 * issued; defaults to 24h inside the command service so existing
 * callers stay binary-compatible.
 */
export interface ApiKeyRotateCommand {
  readonly id: string;
  readonly gracePeriodHours?: number;
}

/**
 * Output of `IApiKeyCommand.create`. `plainKey` is the only place the
 * caller will ever see the raw key — it is NOT persisted and NOT
 * recoverable. Controllers must return it in the HTTP body and warn
 * the user; subsequent reads expose only `ApiKeySummary`.
 */
export interface ApiKeyCreateResult {
  readonly plainKey: string;
  readonly apiKey: ApiKeySummary;
}

/**
 * Output of `IApiKeyCommand.rotate`. Carries the new plaintext key
 * (one-time, same contract as `ApiKeyCreateResult.plainKey`) plus
 * metadata about the old key's scheduled revocation so the caller can
 * surface the grace window in the UI.
 */
export interface ApiKeyRotateResult {
  readonly plainKey: string;
  readonly newKey: ApiKeySummary;
  readonly oldKeyRevocation: {
    readonly id: string;
    readonly revokedAt: Date;
  };
}

// ---------------------------------------------------------------------------
// Read Surface — Pure queries, no audit, no events, no policy checks
// ---------------------------------------------------------------------------

export interface IApiKeyQuery {
  /**
   * List every API key owned by `userId`, projected to `ApiKeySummary`.
   * The order matches the legacy `findAll` contract (newest first).
   */
  findAllForUser(userId: string): Promise<readonly ApiKeySummary[]>;

  /**
   * Resolve a single API key by id, scoped to the owning `userId`.
   * Returns `null` if no row matches the (id, userId) pair — callers
   * translate to `NotFoundException` if appropriate.
   */
  findOneForUser(id: string, userId: string): Promise<ApiKeySummary | null>;
}

// ---------------------------------------------------------------------------
// Write Surface — Mutations with policy checks + audit emission
// ---------------------------------------------------------------------------

/**
 * Every mutation MUST:
 *   1. Enforce ownership / rotation / expiration rules via
 *      `IApiKeyPolicy` BEFORE mutating any persistence state.
 *   2. Persist the mutation through `AbstractApiKeyRepository` — never
 *      against a raw TypeORM repository or `DataSource`.
 *   3. Emit the corresponding audit event via `IApiKeyAuditLogger`
 *      AFTER a successful DB write (never on failure — phantom audit
 *      rows are forbidden).
 *   4. Return the sanitized `ApiKeySummary` DTO, never the raw entity.
 */
export interface IApiKeyCommand {
  /**
   * Issue a new API key. The returned `plainKey` is shown to the
   * caller exactly once; it is NOT recoverable. Emits
   * `AuditEventType.API_KEY_CREATED`.
   */
  create(
    actor: ActorContext,
    command: ApiKeyCreateCommand,
  ): Promise<ApiKeyCreateResult>;

  /**
   * Permanently delete an API key owned by `actor.userId`. Emits
   * `AuditEventType.API_KEY_REVOKED` (PCI-DSS HIGH).
   */
  revoke(actor: ActorContext, id: string, reason?: string): Promise<void>;

  /**
   * Apply partial updates (`name`, `scopes`). No-op writes (no
   * effective change) MUST return the current summary without emitting
   * an audit event. Emits `AuditEventType.API_KEY_UPDATED` on real
   * changes.
   */
  update(
    actor: ActorContext,
    id: string,
    updates: ApiKeyUpdateCommand,
  ): Promise<ApiKeySummary>;

  /**
   * Atomically issue a replacement key and schedule the old key for
   * revocation after `gracePeriodHours` (default 24h). The
   * transaction is owned by the repository
   * (`rotateInTransaction`) — there is no read-modify-write window
   * between insert-new and update-old. Emits
   * `AuditEventType.API_KEY_ROTATED`.
   */
  rotate(
    actor: ActorContext,
    command: ApiKeyRotateCommand,
  ): Promise<ApiKeyRotateResult>;
}

// ---------------------------------------------------------------------------
// Validator Surface — sole hot-path API consumed by ApiKeyGuard
// ---------------------------------------------------------------------------

/**
 * The validator is the ONLY way to authenticate an incoming plaintext
 * API key. It encapsulates the prefix-match + bcrypt-compare +
 * expiration + revocation + grace-window pipeline and returns the
 * sanitized `ValidatedApiKey` projection — NEVER the raw entity.
 *
 * The validator is also responsible for the `lastUsedAt` write-back
 * on successful validations (best-effort; failures here MUST NOT
 * reject the request) and for emitting the `API_KEY_VALIDATION_FAILED`
 * / `API_KEY_EXPIRED` audit events through `IApiKeyAuditLogger`.
 *
 * IP allowlist and rate-limit enforcement remain in `ApiKeyGuard` —
 * the validator only proves the bearer credential is valid.
 */
export interface IApiKeyValidator {
  /**
   * Validate a plaintext key. Returns the projection on success, or
   * `null` on any failure path (unknown prefix, hash mismatch,
   * expired, revoked, past grace window). The guard translates `null`
   * to `UnauthorizedException`.
   */
  validate(
    plainKey: string,
    ctx?: ApiKeyValidationContext,
  ): Promise<ValidatedApiKey | null>;
}

// ---------------------------------------------------------------------------
// Crypto Surface — single-method seam over bcrypt + CSPRNG
// ---------------------------------------------------------------------------

/**
 * Wraps every cryptographic primitive the api-keys module uses so
 * tests can substitute a deterministic implementation without
 * monkey-patching `bcrypt` or `crypto.randomBytes`. The concrete
 * binding is the sole importer of `bcrypt` inside the module.
 */
export interface IApiKeyCryptoService {
  /**
   * Generate a fresh `zth_live_*` token. The 12-character prefix is
   * stored alongside the bcrypt hash on the entity so the validator
   * can scope the candidate-set lookup before running a costly hash
   * comparison.
   */
  generateRawKey(): { plainKey: string; keyPrefix: string };

  /** Bcrypt the plaintext key. Cost factor lives inside the adapter. */
  hash(plainKey: string): Promise<string>;

  /** Bcrypt-compare a plaintext candidate against a stored hash. */
  compare(plainKey: string, hash: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Policy Surface — Ownership, rotation, and expiration enforcement
// ---------------------------------------------------------------------------

/**
 * Narrow check-only surface for API-key policy decisions. Each
 * `assert*` throws (`ForbiddenException` for ownership,
 * `BadRequestException` for state / expiration) rather than returning
 * a boolean, so callers do not have to branch on the policy result.
 *
 * Implementations are pure functions; no DB, no audit, no event bus.
 */
export interface IApiKeyPolicy {
  /**
   * Throw `ForbiddenException` if `key.userId !== actorId`. Used by
   * every command before any mutation.
   */
  assertOwnedBy(key: ApiKeySummary, actorId: string): void;

  /**
   * Throw `BadRequestException` if the key has already been rotated
   * (`rotatedToKeyId` is non-null). A rotated key cannot be rotated
   * again — the caller must rotate the latest key in the chain.
   */
  assertNotRotated(key: ApiKeySummary): void;

  /**
   * Throw `BadRequestException` if the key's `expiresAt` is in the
   * past. The validator uses this to short-circuit the hot path.
   */
  assertNotExpired(key: ApiKeySummary): void;

  /**
   * Throw `BadRequestException` if `revokeAt` is set and in the past
   * (the grace window has elapsed). Used by the validator alongside
   * `assertNotExpired`.
   */
  assertWithinGracePeriod(key: ApiKeySummary): void;
}

// ---------------------------------------------------------------------------
// Audit Surface — sole consumer of AuditService inside the module
// ---------------------------------------------------------------------------

/**
 * Typed metadata bag passed to every `log*` method. Numbers, strings,
 * booleans, dates, and null are intentionally the only leaf shapes
 * permitted — this matches what `AuditService` serialises today and
 * prevents accidental entity leakage through the metadata column.
 */
export type ApiKeyAuditMetadata = Readonly<
  Record<string, string | number | boolean | Date | null | undefined>
>;

/**
 * Per-event method surface — one method per `AuditEventType.API_KEY_*`
 * variant. The validator/command/cleanup services call into this
 * surface instead of `AuditService` directly so the audit envelope
 * (resourceType, severity, redaction policy) lives in exactly one
 * place.
 */
export interface IApiKeyAuditLogger {
  /** `API_KEY_CREATED` — severity HIGH. */
  logCreated(actor: ActorContext, key: ApiKeySummary): Promise<void>;

  /** `API_KEY_REVOKED` — severity HIGH. */
  logRevoked(
    actor: ActorContext,
    key: ApiKeySummary,
    reason?: string,
  ): Promise<void>;

  /** `API_KEY_UPDATED` — severity MEDIUM. */
  logUpdated(
    actor: ActorContext,
    key: ApiKeySummary,
    changes: ReadonlyArray<{
      field: string;
      oldValue: unknown;
      newValue: unknown;
    }>,
  ): Promise<void>;

  /** `API_KEY_ROTATED` — severity HIGH. */
  logRotated(
    actor: ActorContext,
    oldKey: ApiKeySummary,
    newKey: ApiKeySummary,
    revokeAt: Date,
  ): Promise<void>;

  /** `API_KEY_VALIDATED` — severity LOW. Emitted on every successful auth. */
  logValidated(
    key: ValidatedApiKey,
    ctx: ApiKeyValidationContext,
  ): Promise<void>;

  /** `API_KEY_VALIDATION_FAILED` — severity MEDIUM. */
  logValidationFailed(
    keyPrefix: string,
    reason: string,
    ctx: ApiKeyValidationContext,
  ): Promise<void>;

  /** `API_KEY_EXPIRED` — severity MEDIUM. */
  logExpired(key: ValidatedApiKey, ctx: ApiKeyValidationContext): Promise<void>;

  /** `API_KEY_IP_DENIED` — severity HIGH (potential exfiltration). */
  logIpDenied(
    key: ValidatedApiKey,
    deniedIp: string,
    ctx: ApiKeyValidationContext,
  ): Promise<void>;

  /**
   * `API_KEY_VALIDATION_FAILED` — severity HIGH. Emitted by the cleanup
   * cron's rate-limit anomaly detector when a key exceeds the
   * violation threshold inside the rolling 24-hour window. Distinct
   * from `logValidationFailed` because the cron carries richer
   * per-key context (the legacy `apiKey.rateLimit`, the violation
   * count, the threshold) that the hot-path validator does not have.
   */
  logRateLimitAnomaly(args: {
    readonly keyId: string;
    readonly userId: string;
    readonly organizationId: string | null;
    readonly keyPrefix: string;
    readonly rateLimit: number;
    readonly violations: number;
    readonly threshold: number;
  }): Promise<void>;

  /**
   * `CLEANUP_JOB_COMPLETED` — severity LOW on success, HIGH on failure.
   * Job-orchestration metadata emitted at the end of every cleanup
   * cron tick. Routed through this logger (not `AuditService` direct)
   * so the audit service stays the SOLE consumer of `AuditService`
   * inside the module. `error` is set iff the job failed.
   */
  logCleanupSummary(stats: {
    readonly purgedCount: number;
    readonly notifiedCount: number;
    readonly anomalies: number;
    readonly durationMs: number;
    readonly error?: string;
  }): Promise<void>;
}
