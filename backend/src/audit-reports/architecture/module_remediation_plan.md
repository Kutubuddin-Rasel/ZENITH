# Module Remediation Plan - Modernization Blueprint

> **Document Type:** Architecture Strategy  
> **Created:** 2026-01-11  
> **Status:** In Progress  
> **Total Modules:** 50

---

## Progress Checklist

### Tier 1: Authentication & Security
- [x] auth (7.4/10) ✅
- [] rbac (5.5/10) 
- [] access-control (8.4/10) 
- [] api-keys (5.3/10) 
- [] csrf (8.3/10) 
- [] session (7.3/10) 
- [] encryption (8.9/10) 

### Tier 2: Core Infrastructure
- [] app (8.8/10) 
- [] database (8.3/10) 
- [] cache (9.1/10) 
- [] common (8.8/10) 
- [] performance (8.0/10) 
- [] circuit-breaker (8.9/10) 
- [] tenant (9.4/10) 

### Tier 3: Project Management Core
- [] projects (8.5/10) 
- [] issues (9.0/10) 
- [] boards (8.0/10) 
- [] sprints (8.7/10) 
- [] comments (6.5/10) 
- [] attachments (5.5/10) 
- [] releases (8.2/10) 
- [] backlog (7.0/10) 

### Tier 4: Customization & Workflow
- [] custom-fields (3.5/10) 
- [] workflows (6.5/10) 
- [] taxonomy (8.5/10) 

### Tier 5: Communication
- [] notifications (7.8/10) 
- [] email (4.5/10) 
- [] webhooks (7.5/10) 
- [] gateways (5.5/10) 

### Tier 6: AI & Intelligence
- [] ai (8.7/10) 
- [] rag (6.8/10) 

### Tier 7: Analytics & Monitoring
- [] analytics (7.8/10) 
- [] reports (8.8/10) 
- [] health (9.2/10) 
- [] audit (9.3/10) 
- [] telemetry (5.5/10) 
- [] scheduled-tasks (9.0/10) 

### Tier 8: User & Organization
- [] users (8.6/10) 
- [] organizations (8.2/10) 
- [] membership (7.8/10) 
- [] invites (8.3/10) 

### Tier 9: Other Modules
- [] billing (8.8/10) 
- [] gamification (5.8/10) 
- [] satisfaction (7.2/10) 
- [] search (8.5/10) 
- [] user-preferences (9.0/10) 
- [] watchers (8.0/10) 
- [] onboarding (8.7/10)
- [] revisions (9.1/10) 
- [] work-logs (7.5/10) 

---

## Remediation Strategies

---

## Module: Auth

> **Score:** 7.4/10 | **Priority:** 🔴 CRITICAL  
> **Standard:** OAuth 2.0 / OIDC / NIST 800-63B Digital Identity Guidelines

### Current State Summary

The auth module has solid foundational security (Argon2id hashing, refresh token rotation, CSRF protection) but lacks **account lockout on failed attempts**, **session invalidation on password change**, **hashed recovery codes**, and **password breach detection**—all mandatory per NIST 800-63B.

### Industry Standard Target

**How Google/Okta/Auth0 Engineers Build Auth Today:**

1. **Credential Stuffing Defense (NIST 800-63B §5.1.1.2):** Every login attempt is tracked per user. After 5 failures in 15 minutes, the account enters a progressive lockout (5min → 15min → 1hr → manual unlock). Google calls this "Suspicious Activity Detection."

2. **Password Breach Detection (NIST 800-63B Memorized Secret Verifiers):** All new passwords are checked against the HIBP k-anonymity API before acceptance. This is non-negotiable for enterprise auth.

3. **Session Invalidation on Credential Change (OAuth 2.0 Security BCP):** When a password is changed, ALL refresh tokens and sessions MUST be revoked immediately. The user can optionally keep the current session. Auth0 and Okta do this automatically.

4. **Backup Code Security (TOTP RFC 6238):** Recovery codes are one-time secrets equivalent to passwords. They must be stored hashed (bcrypt/argon2), not plaintext. Loss of this data in a breach = full 2FA bypass for all users.

5. **Token Revocation (RFC 7009):** A Redis-backed token blacklist enables instant revocation of access tokens (logout, ban, breach response). Short expiry alone is insufficient for compliance.

### The Fix Strategy

**Phase 1 - Account Lockout System (Week 1):**  
Introduce a `LoginAttempt` tracking mechanism using Redis (key: `lockout:${userId}`, TTL: 15 minutes). The `validateUser()` flow checks this count BEFORE password verification to prevent timing attacks. After 5 failures, return a generic "Invalid credentials" with a silent 15-minute lock. Implement exponential backoff with configurable thresholds via `ConfigService`. Add a privileged admin endpoint to manually unlock accounts. Emit `LOGIN_LOCKED` audit events.

**Phase 2 - Session Invalidation on Password Change (Week 1):**  
Modify `users.service.ts:changePassword()` to call `sessionsService.revokeAllExceptCurrent(userId, currentSessionId)` after the password hash is saved. The current session can be preserved if passed as a parameter. Add a `passwordVersion` increment (already exists) that JWT validation checks—if token's `passwordVersion` < user's, reject even valid tokens.

**Phase 3 - Recovery Code Hashing (Week 2):**  
Refactor `two-factor-auth.service.ts` to hash each recovery code with Argon2id before storage. On verification, iterate through stored hashes with `Promise.any()` for an O(n) constant-time comparison. Remove the used code by its hash. Generate 10 codes (standard), show once, never retrieve plaintext again.

**Phase 4 - Password Breach Detection (Week 2):**  
Create a `PasswordBreachService` that implements the HIBP Passwords API v3 (k-anonymity model). Only the first 5 SHA-1 hash characters are sent to the API. Integrate into `register()` and `changePassword()` flows. Cache negative results in Redis for 24h to minimize API calls. This is non-blocking—if API fails, log warning and proceed.

**Phase 5 - Token Blacklist (Week 3):**  
Implement Redis SET-based token blacklist with TTL matching token expiry. On logout, password change, or admin revocation, add the token's JTI to the blacklist. JwtStrategy validates against blacklist on every request. Use a Lua script for atomic add with expiry.

### Migration Risk

**Risk Level:** 🟡 MEDIUM

- **Password Change Session Revocation:** Existing sessions become invalid immediately. Users may need to re-login unexpectedly. Mitigate with clear UX messaging and the "keep current session" option.
- **Recovery Code Migration:** Existing plaintext codes must be re-generated. Users with 2FA enabled need new backup codes—coordinate via email notification before deployment.
- **Account Lockout False Positives:** Legitimate users may be locked out by mistake (shared IP, typos). Ensure unlock mechanism is accessible (email link, support channel).

---

## Module: RBAC

> **Score:** 5.5/10 | **Priority:** 🔴 CRITICAL  
> **Standard:** NIST AC-3 Access Enforcement / OWASP RBAC Guidelines / Google Zanzibar-Inspired Authorization

### Current State Summary

The RBAC module has a solid database-backed permission model with role caching, `@RequirePermission` decorator usage (220+ instances), and protection for system roles. However, the **PermissionsGuard bypasses the entire database** with a 150-line hardcoded permission map, **no audit logging** exists for role/permission changes, and **no permission inheritance** is implemented. This fundamentally breaks the authorization architecture.

### Industry Standard Target

**How Google/Okta/AWS Engineers Build RBAC Today:**

1. **Single Source of Truth (NIST AC-3):** All permission decisions MUST flow through the same data source. Google's Zanzibar (used by Drive, Calendar, Cloud) stores all relationships in a single, consistent store. Having a hardcoded map alongside a database is an anti-pattern that creates security drift.

2. **Permission Inheritance (OWASP RBAC):** Enterprise RBAC systems implement role hierarchies: `SuperAdmin > Admin > Developer > Viewer`. AWS IAM, Azure RBAC, and Okta all support this. Each role inherits permissions from its parent, reducing management overhead and preventing gaps.

3. **Audit-Grade Logging (SOC 2 / ISO 27001):** Every permission change (role created, permissions modified, role deleted) MUST be logged with who, what, when, and from where. This is non-negotiable for compliance. PCI-DSS 10.2.5 specifically requires logging changes to access rights.

4. **Access Denial Logging (Defense in Depth):** Every `ForbiddenException` thrown should be logged as a security event. This enables detection of privilege escalation attempts, misconfigured roles, and attack patterns. AWS CloudTrail logs every denied API call.

5. **Cache Invalidation on Change (Consistency):** When role permissions change, the cached permissions MUST be invalidated immediately—not after TTL expiry. Google uses cache-aside with pub/sub invalidation.

### The Fix Strategy

**Phase 1 - Eliminate Hardcoded Permission Map (Week 1):**  
Refactor `permissions.guard.ts` to remove the entire 150-line `projectPermissionsMap` object. Replace with a call to `RBACService.hasPermission(roleId, resource, action)`. The guard should:
1. Extract `roleId` from the membership (already available)
2. Call `RBACService.getRolePermissions(roleId)` (already cached, 5-min TTL)
3. Check if `requiredPermission` exists in the returned permission set
4. Throw `ForbiddenException` if not found

This aligns the guard with the database, making `createCustomRole()` functional. The CASL integration (`casl-ability.factory.ts`) should also be migrated to use `RBACService` instead of the `ProjectRole` enum.

**Phase 2 - RBAC Audit Logging (Week 1):**  
Inject `AuditLogsService` into `RBACService`. Add audit events for:
- `ROLE_CREATED`: Log role name, initial permissions, creator
- `ROLE_UPDATED`: Log before/after permissions, updater, timestamp
- `ROLE_DELETED`: Log role name, member count at deletion, deleter
- `PERMISSION_ASSIGNED`: Log role, permission, assigner
- `PERMISSION_REVOKED`: Log role, permission, revoker

Use structured metadata: `{ roleId, roleName, permissions: string[], changedBy: userId, changedAt: ISO8601 }`.

**Phase 3 - Access Denial Logging (Week 2):**  
Before every `throw new ForbiddenException()` in `permissions.guard.ts`, add:
```typescript
await this.auditService.log({
  action: 'ACCESS_DENIED',
  severity: 'WARNING',
  actor_id: user.userId,
  resource_type: 'Permission',
  resource_id: requiredPermission,
  metadata: { projectId, roleName, roleId, attemptedAction: requiredPermission, reason: 'Insufficient permissions' }
});
```
This creates a security signal for SIEM integration and anomaly detection.

**Phase 4 - Permission Inheritance (Week 2):**  
Add `parentRoleId` column to `Role` entity with a self-referencing `@ManyToOne` relation. Modify `RBACService.getRolePermissions()` to recursively collect permissions from the parent chain:
```typescript
async getRolePermissions(roleId: string): Promise<string[]> {
  const role = await this.getRoleWithParent(roleId);
  const ownPermissions = role.permissions.map(p => p.permissionString);
  if (role.parentRole) {
    const inheritedPermissions = await this.getRolePermissions(role.parentRole.id);
    return [...new Set([...inheritedPermissions, ...ownPermissions])];
  }
  return ownPermissions;
}
```
Add cycle detection (max depth of 10) to prevent infinite loops. Cache the computed permission set.

**Phase 5 - Deprecate ProjectRole Enum (Week 3):**  
Create a migration script that:
1. Maps existing `ProjectRole` enum values to database roles
2. Updates `casl-ability.factory.ts` to fetch abilities from `RBACService`
3. Removes all `import { ProjectRole }` statements
4. Marks the enum file as deprecated with a 2-release warning

### Migration Risk

**Risk Level:** 🟠 HIGH

- **Guard Refactor Breaking Change:** Existing project memberships rely on `roleName` string matching. Ensure database contains all expected roles before deploying. Run full regression on protected endpoints.
- **Custom Role Activation:** After this fix, custom roles will suddenly work. Audit all existing custom roles created via `createCustomRole()` to ensure they have appropriate permissions.
- **Inheritance Loops:** If `parentRoleId` is set incorrectly, infinite recursion can occur. Enforce max depth (10) and add validation to prevent a role from being its own ancestor.
- **Cache Invalidation Timing:** During the transition, old cached permissions may persist for up to 5 minutes. Consider reducing cache TTL or implementing immediate invalidation via event emitter.

---

## Module: Access-Control

> **Score:** 8.4/10 | **Priority:** 🟡 IMPORTANT  
> **Standard:** OWASP IP Access Control / NIST SP 800-41 (Firewall Guidelines) / Zero Trust Architecture (BeyondCorp)

### Current State Summary

The access-control module is architecturally excellent—supporting IP whitelisting/blacklisting, CIDR ranges, geographic restrictions, time-based rules, and emergency access with full audit trails. However, it suffers from **missing DTO validation** (no class-validator decorators), **no rule caching** (DB hit on every request), and **X-Forwarded-For header spoofing vulnerability** due to lack of trusted proxy configuration.

### Industry Standard Target

**How Cloudflare/AWS/Google Engineers Build Access Control Today:**

1. **Input Validation at the Edge (OWASP Input Validation):** Every API that accepts IP addresses, CIDR ranges, or rule definitions MUST validate input using strict schema validation. Cloudflare's WAF rules engine validates all rule structures before acceptance to prevent injection attacks and malformed rules that could cause runtime failures.

2. **Multi-Layer Caching (Zero Trust Architecture):** Google's BeyondCorp implements a tiered caching strategy for access decisions: L1 in-memory cache (process-local, sub-millisecond), L2 distributed cache (Redis, ~1ms), L3 database (fallback). Rules are cached aggressively with TTL and invalidated via pub/sub on change.

3. **Trusted Proxy Chain (RFC 7239 Forwarded Header):** To prevent IP spoofing, production systems MUST configure a trusted proxy list. Only accept X-Forwarded-For from known load balancers (AWS ALB, Cloudflare, Nginx). Direct connections should use socket IP. AWS WAF and Cloudflare both implement this pattern to ensure accurate client IP attribution.

4. **Organization-Level Isolation (Multi-Tenant Security):** Enterprise access-control systems scope rules to organizations/tenants. Stripe's access control ensures rules created by Org A cannot affect Org B. This requires an `organizationId` foreign key on all access rules.

5. **Rule Versioning and History (Compliance Requirement):** For audit compliance (SOC 2, ISO 27001), every rule modification should create a historical record. AWS Config and Azure Policy both maintain full change history for access policies.

### The Fix Strategy

**Phase 1 - DTO Validation Hardening (Week 1):**  
Create dedicated DTO files in a `dto/` subdirectory with comprehensive class-validator decorators. IP addresses must be validated using the `@IsIP()` decorator with version specification. CIDR ranges require custom validation using a regex pattern or library like `ip-cidr`. Geographic codes must be validated against ISO 3166-1 alpha-2 country list. Priority fields need `@IsInt()`, `@Min(0)`, and `@Max(1000)` constraints. All string inputs (name, description) must have `@Length()` constraints and be sanitized to prevent XSS.

**Phase 2 - Multi-Tier Rule Caching (Week 1):**  
Implement a cache-aside pattern for access rules. On first request, fetch active rules from the database and store in Redis with a 60-second TTL. Subsequent requests read from Redis. Critical: implement cache invalidation—when any rule is created, updated, or deleted, publish an event via `EventEmitter2` that triggers cache purge. For high-performance scenarios, add a process-local LRU cache (using `lru-cache` library) in front of Redis with a 5-second TTL as L1 cache.

**Phase 3 - Trusted Proxy Configuration (Week 2):**  
Add a `TRUSTED_PROXIES` environment variable that accepts a comma-separated list of IP addresses or CIDR ranges (e.g., `10.0.0.0/8,172.16.0.0/12` for internal load balancers). Modify the `getClientIP()` function in the guard to first check if the connection's socket IP is in the trusted proxy list. If yes, parse `X-Forwarded-For` and extract the rightmost untrusted IP (not the leftmost, which can be spoofed). If the connection is direct (not from trusted proxy), use the socket IP and ignore all forwarded headers.

**Phase 4 - Organization-Level Scoping (Week 2):**  
Add `organizationId` column to the `IPAccessRule` entity as an optional foreign key. Update `getActiveRules()` to accept organization context from the request and filter rules accordingly. Global rules (null organizationId) apply to all organizations. Organization-specific rules apply only to that tenant. This enables multi-tenant deployments where each organization manages their own IP policies without affecting others.

**Phase 5 - Rule History Tracking (Week 3):**  
Create an `AccessRuleHistory` entity that stores: rule ID, change type (CREATE/UPDATE/DELETE), previous values (JSONB), new values (JSONB), changed by (user ID), and timestamp. Before any mutation to `IPAccessRule`, snapshot the current state. Use a database trigger or service-layer interceptor. This provides full audit trail for compliance reporting and enables rule rollback capabilities.

### Migration Risk

**Risk Level:** 🟢 LOW

- **DTO Validation Addition:** Purely additive change. Existing valid data will pass; invalid data will be rejected going forward. No migration of existing data required, but consider validating existing rules with a one-time script.
- **Caching Introduction:** Transparent to consumers. Worst case is stale rules for up to 60 seconds after change. Mitigate with immediate cache invalidation and short TTL during rollout.
- **Trusted Proxy Config:** Requires coordination with infrastructure team to identify all proxy IPs. Incorrect configuration could block legitimate users or allow spoofing. Deploy with `TRUSTED_PROXIES` empty first (disables feature), then configure in staging before production.
- **Organization Scoping:** Nullable column addition is backward compatible. Existing rules remain global until explicitly scoped.

---

## Module: API-Keys

> **Score:** 5.3/10 | **Priority:** 🔴 CRITICAL  
> **Standard:** OAuth 2.0 Client Credentials / API Key Management Best Practices (Stripe/Twilio) / NIST SP 800-57 Key Management

### Current State Summary

The API-Keys module has excellent key generation (cryptographically secure) and proper hashing (bcrypt), but is critically deficient in **audit logging** (0/10 score), **per-key rate limiting** (0/10 score), and lacks **IP restrictions**, **key rotation endpoints**, and **scope vocabulary governance**—all mandatory for enterprise API key management.

### Industry Standard Target

**How Stripe/Twilio/AWS Engineers Build API Key Management Today:**

1. **Complete Audit Trail (PCI-DSS Requirement 10):** Every API key lifecycle event—creation, rotation, revocation, scope change—MUST be logged with user identity, timestamp, source IP, and key metadata. Stripe logs every key event to an immutable audit store with 7-year retention for compliance.

2. **Per-Key Rate Limiting (Abuse Prevention):** Each API key has its own rate limit quota stored in the key record. Twilio implements this as requests-per-second with burst allowances. A compromised or misbehaving key can be throttled independently without affecting other keys or users.

3. **IP Restriction Binding (Zero Trust):** Enterprise API keys should be bound to specific IP addresses or CIDR ranges. AWS IAM supports IP conditions on API credentials. A stolen key is useless if it can only be used from the customer's data center IP range.

4. **Zero-Downtime Key Rotation (Operational Excellence):** Stripe's API supports creating a new key while the old one remains valid for a grace period (typically 24-72 hours). This allows customers to rotate keys without service interruption—critical for automated deployments.

5. **Scope Vocabulary Governance (Least Privilege):** API scopes must be defined from a controlled vocabulary, not arbitrary strings. Google Cloud APIs define scopes like `https://www.googleapis.com/auth/cloud-platform.read-only`. This prevents scope creep and enables granular access analysis.

6. **Key Hygiene Automation:** Expired keys should be automatically cleaned up via scheduled jobs. Long-unused keys (90+ days) should trigger alerts for potential revocation. AWS Access Analyzer provides this capability for IAM keys.

### The Fix Strategy

**Phase 1 - Comprehensive Audit Logging (Week 1):**  
Inject `AuditLogsService` into `ApiKeysService`. Log every mutation with structured metadata: `API_KEY_CREATED` (key prefix, name, scopes, expiry, creator IP), `API_KEY_REVOKED` (revoker, reason if provided), `API_KEY_UPDATED` (field changed, before/after values), `API_KEY_ROTATED` (old prefix, new prefix, grace period). Use severity HIGH for create/revoke, MEDIUM for updates. Include `user-agent` header for client identification.

**Phase 2 - Per-Key Rate Limiting (Week 1):**  
Add `rateLimit` column to `ApiKey` entity with sensible default (e.g., 100 requests/minute). In `ApiKeyGuard`, after successful key validation, check rate against Redis counter keyed by `api_key_rate:{keyId}`. Use Redis INCR with EXPIRE for sliding window. If limit exceeded, throw HTTP 429 with `Retry-After` header. Allow per-key customization and admin override for premium clients.

**Phase 3 - IP Allowlist Restriction (Week 2):**  
Add `allowedIPs` JSON column to `ApiKey` entity accepting array of IPs or CIDR ranges. In `ApiKeyGuard`, if `allowedIPs` is non-empty, validate request IP against the list using `ip-address` library (handles IPv4, IPv6, CIDR). Rejection should log `API_KEY_IP_DENIED` audit event with attempted IP for security monitoring.

**Phase 4 - Key Rotation Endpoint (Week 2):**  
Add `POST /api-keys/:id/rotate` endpoint. The flow: create new key with identical settings (name, scopes, project, rate limit, IP restrictions), set old key's `revokeAt` timestamp to current time + grace period (configurable, default 24 hours), return new plaintext key. Background job `ApiKeyCleanupService` revokes keys past their `revokeAt` timestamp. This enables zero-downtime rotation.

**Phase 5 - Scope Vocabulary Governance (Week 3):**  
Create `ApiScope` entity or constant file defining all allowed scopes with metadata (resource, action, description, risk level). Update `CreateApiKeyDto` to validate `scopes` array against this vocabulary using custom class-validator decorator `@IsAllowedScope()`. Document all scopes in OpenAPI spec. Implement scope hierarchy where `projects:admin` implies `projects:read` and `projects:write`.

**Phase 6 - Automated Key Hygiene (Week 3):**  
Create `ApiKeyCleanupService` scheduled task (CRON) that runs daily: purge keys past expiration + 30 days grace, identify keys unused for 90+ days and send notification to owner, flag keys with anomalous usage patterns (sudden spike, geographic shift) for review. Store hygiene run results in audit log.

### Migration Risk

**Risk Level:** 🟡 MEDIUM

- **Audit Logging:** No breaking changes. Purely additive. Immediately deployable.
- **Rate Limiting:** New column with default value is safe. Existing keys inherit default limit. May require communication to heavy API users if default is restrictive.
- **IP Allowlist:** Nullable column is backward compatible. Existing keys have no IP restriction (unrestricted). Consider offering opt-in IP restriction via account settings.
- **Key Rotation:** New endpoint, no impact on existing flows. Ensure `revokeAt` column has database default of NULL.
- **Scope Validation:** BREAKING for clients sending invalid scopes. Requires audit of existing keys to ensure all current scopes are in vocabulary. Provide migration period with warnings before enforcement.

---

## Module: CSRF

> **Score:** 8.3/10 | **Priority:** 🟡 IMPORTANT  
> **Standard:** OWASP CSRF Prevention Cheat Sheet / RFC 6749 CSRF Prevention / Synchronizer Token Pattern

### Current State Summary

The CSRF module is one of the strongest in the codebase with **two complementary defenses** (stateless double-submit and stateful Redis-backed validation), timing-safe comparisons, and 32-byte crypto-secure tokens. However, it has **incomplete coverage** (password change, session revocation, 2FA endpoints unprotected), **missing audit logging** for validation failures, and the **stateful token endpoint lacks authentication guard**.

### Industry Standard Target

**How Google/Auth0/Okta Engineers Build CSRF Protection Today:**

1. **Defense in Depth (OWASP Methodology):** Production systems implement multiple CSRF defenses: SameSite cookies as primary barrier, Synchronizer Token Pattern as secondary, and Origin/Referer header validation as tertiary. Google's security infrastructure uses all three layers simultaneously.

2. **Universal Coverage via Global Guard (Zero Trust):** Every state-changing endpoint (POST/PUT/PATCH/DELETE) MUST be protected. Auth0 applies CSRF protection globally with explicit opt-out for public/webhook endpoints rather than opt-in. This prevents developers from accidentally exposing endpoints.

3. **Attack Detection and Alerting (SIEM Integration):** Every CSRF validation failure is logged as a HIGH severity security event. Repeated failures from same user/IP trigger real-time alerts. Netflix's security pipeline feeds CSRF failures into their anomaly detection system.

4. **Token Endpoint Authentication (Defense Hardening):** Endpoints that issue security tokens MUST be authenticated. A CSRF token endpoint accessible without authentication could be used for reconnaissance or resource exhaustion attacks.

5. **Guard Consolidation (Developer Experience):** Having multiple guards with similar names creates confusion and increases error probability. Auth0 uses a single configurable guard with mode parameter rather than separate implementations.

### The Fix Strategy

**Phase 1 - Token Endpoint Authentication Fix (Week 1):**  
Add `@UseGuards(JwtAuthGuard)` decorator to the `/auth/csrf-token` endpoint in `csrf.controller.ts`. This ensures `req.user.userId` is guaranteed to exist before token generation. Add defensive check in service layer to throw explicit error if user ID is undefined.

**Phase 2 - CSRF Failure Audit Logging (Week 1):**  
Inject `AuditLogsService` into both CSRF guard implementations. Before throwing `ForbiddenException`, log an audit event with: event type `CSRF_VALIDATION_FAILED`, severity HIGH, endpoint path, HTTP method, presence/absence of header token, presence/absence of cookie token, user ID (if authenticated), and client IP. This creates attack detection signal for SIEM integration.

**Phase 3 - Expand CSRF Coverage (Week 2):**  
Audit all controllers for state-changing endpoints using POST/PUT/PATCH/DELETE methods. Add `@UseGuards(CsrfGuard)` to: `UsersController.changePassword()`, `SessionsController.revokeSession()` and `revokeAllSessions()`, all `TwoFactorAuthController` mutation endpoints (`enable`, `disable`, `regenerateBackupCodes`). Create a checklist in code review process to verify CSRF protection on new endpoints.

**Phase 4 - Guard Consolidation and Naming (Week 2):**  
Rename guards for clarity: `auth/guards/csrf.guard.ts` becomes `StatelessCsrfGuard` (double-submit cookie pattern), `security/csrf/csrf.guard.ts` becomes `StatefulCsrfGuard` (Redis-backed). Add comprehensive JSDoc documentation explaining when to use each: stateless for general cookie-authenticated endpoints (simpler, no Redis dependency), stateful for high-security operations requiring explicit token tracking (password change, 2FA).

**Phase 5 - Rate Limiting on CSRF Failures (Week 3):**  
Implement Redis-based tracking of CSRF failures per user/IP combination. After 10 failures in 5 minutes, temporarily block the source with a soft lock (return 429 Too Many Requests). This prevents attackers from brute-forcing token patterns and protects against DoS via intentional CSRF trigger spam.

### Migration Risk

**Risk Level:** 🟢 LOW

- **Token Endpoint Auth Guard:** May cause 401 for unauthenticated calls to `/auth/csrf-token`. This is correct behavior—clients should only request CSRF tokens after authentication. No frontend changes needed if following correct flow.
- **Expanded CSRF Coverage:** May cause 403 errors for legitimate requests missing CSRF token. Coordinate with frontend team to ensure all affected endpoints send the token. Roll out with monitoring and quick rollback capability.
- **Guard Renaming:** Will require updating import paths across codebase. Use IDE refactoring tools. Low risk if done atomically with thorough testing.
- **Failure Rate Limiting:** May cause false positives for users with network issues causing duplicate submissions. Set thresholds conservatively (10 failures) and implement user-friendly error messaging.

---

## Module: Session

> **Score:** 7.3/10 | **Priority:** 🟡 IMPORTANT  
> **Standard:** OAuth 2.0 Session Management / OWASP Session Management Cheat Sheet / NIST SP 800-63B Session Binding

### Current State Summary

The Session module has **enterprise-grade features** (concurrent session limits, suspicious activity detection, device fingerprinting, session locking, comprehensive audit logging) but suffers from a **critical architecture violation**: two parallel implementations exist (`session/` with 40+ fields and `auth/sessions.*` with 15 fields), creating confusion and potential security gaps. Additionally, **no CSRF protection** on session termination endpoints (0/10) and **no DTO validation** on controller inputs.

### Industry Standard Target

**How Google/Okta/Auth0 Engineers Build Session Management Today:**

1. **Single Session Implementation (DRY Principle):** Enterprise systems maintain ONE authoritative session store. Google's session infrastructure uses a unified session entity across all authentication flows. Having two parallel implementations (`sessions` + `user_sessions` tables) violates separation of concerns and creates data inconsistency risks.

2. **Universal CSRF Protection (OWASP Requirement):** All state-changing session operations (terminate, lock, revoke all) MUST be CSRF-protected. Okta applies CSRF guards globally to all mutation endpoints. Session hijacking via CSRF is a well-documented attack vector.

3. **Strict Input Validation (Defense in Depth):** Session identifiers must be validated as UUIDs before database lookups. Termination reasons should be length-limited and sanitized. Auth0 uses class-validator decorators on all session DTOs.

4. **Secure Connection Detection (Zero Trust):** Production environments behind load balancers use `X-Forwarded-Proto` header or `request.secure` property to detect HTTPS, not just localhost checks. AWS ALB and Cloudflare set these headers automatically.

5. **Decorator-Based Public Route Declaration:** Instead of hardcoded route lists in interceptors, use the established `@Public()` decorator pattern for consistency. This prevents accidental omissions when adding new public endpoints.

### The Fix Strategy

**Phase 1 - CSRF Protection Enforcement (Week 1):**  
Add `CsrfGuard` to `SessionController` at the class level (applying to all methods). This protects `terminateSession()`, `terminateAllMySessions()`, and `lockSession()` endpoints. Coordinate with frontend to ensure CSRF token is sent with all session management requests.

**Phase 2 - DTO Validation Hardening (Week 1):**  
Create dedicated DTO files in `session/dto/` directory with comprehensive class-validator decorators. `TerminateSessionDto` requires `@IsUUID()` on sessionId and `@IsOptional() @IsString() @Length(1, 500)` on reason. `LockSessionDto` requires same validation. `SessionQueryDto` requires `@IsOptional() @IsUUID()` on userId and `@IsOptional() @IsEnum(SessionStatus)` on status.

**Phase 3 - Secure Connection Detection Fix (Week 2):**  
Refactor `isSecureConnection()` method to accept the full Request object instead of just IP address. Check `X-Forwarded-Proto` header first (for load balancer environments), then `request.secure` property (for direct TLS connections), then fall back to localhost detection for development. This ensures accurate security metrics in production.

**Phase 4 - Session Implementation Consolidation (Week 2-3):**  
Analyze the relationship between `session/` (enterprise session with suspicious activity, locking, concurrent limits) and `auth/sessions.*` (JWT refresh token tracking). Options: (A) Migrate all `UserSession` features into `Session` entity and deprecate `user_sessions` table, (B) Rename for clarity: `WebSession` vs `RefreshTokenSession` with documented separation of concerns, (C) Create unified `SessionManager` service that orchestrates both. Document the chosen approach in architecture ADR.

**Phase 5 - Decorator Pattern for Public Routes (Week 3):**  
Replace hardcoded `isPublicRoute()` list in `SessionInterceptor` with Reflector-based `@Public()` decorator detection. Use `this.reflector.get<boolean>('isPublic', context.getHandler())` to check for decorator presence. This aligns with the pattern used in `JwtAuthGuard` and prevents route sync issues.

### Migration Risk

**Risk Level:** 🟡 MEDIUM

- **CSRF Addition:** May cause 403 errors for session management requests missing CSRF token. Frontend must be updated to include token. Roll out with monitoring.
- **DTO Validation:** May reject previously-accepted invalid inputs. Audit existing session management flows to ensure compliance.
- **Session Consolidation:** HIGH RISK for data migration if merging tables. Requires careful planning, backup strategy, and staged rollout. Consider dual-write period during transition.
- **Secure Connection Refactor:** Low risk—only affects metrics/logging, not session functionality.

---

## Module: Encryption

> **Score:** 8.9/10 | **Priority:** 🟡 IMPORTANT  
> **Standard:** NIST SP 800-38D (GCM) / NIST SP 800-57 (Key Management) / OWASP Cryptographic Storage Cheat Sheet

### Current State Summary

The Encryption module is the **strongest cryptographic implementation** in the codebase with industry-standard AES-256-GCM, proper IV generation, authentication tags, AAD, and mandatory production keys. However, the **`rotateKeys()` method is broken** (doesn't actually update master key or re-encrypt data), **no audit logging** exists for encryption operations (0/10), self-signed certificate generation uses **risky shell execution**, and **per-file encryption keys are returned unencrypted** to callers.

### Industry Standard Target

**How AWS/Google/Stripe Engineers Build Encryption Today:**

1. **Complete Key Rotation Workflow (NIST SP 800-57):** Key rotation MUST include re-encryption of existing data with the new key. AWS KMS implements this via key versioning—new encryptions use the new key, while decryption transparently handles both old and new key versions during a transition period.

2. **Envelope Encryption (Defense in Depth):** Per-file or per-record encryption keys (Data Encryption Keys, DEKs) should be wrapped/encrypted with the master Key Encryption Key (KEK) before storage. AWS S3 server-side encryption uses this pattern—DEKs are stored encrypted alongside the ciphertext.

3. **Audit Logging All Crypto Operations (Compliance):** SOC 2, HIPAA, and PCI-DSS require logging of encryption/decryption events. Google Cloud KMS logs every key usage to Cloud Audit Logs. This enables detection of unauthorized access patterns.

4. **Pure-Library Certificate Generation (Security):** Shell execution with process substitution can leak private keys to process lists. Use pure-JavaScript libraries like `node-forge` or the built-in `crypto` module for certificate generation to eliminate attack surface.

5. **Key Derivation Functions (Enhanced Security):** Derive encryption keys from master key using HKDF or PBKDF2 with unique contexts. This enables generating multiple purpose-specific subkeys (one for user data, one for files, one for audit logs) from a single master key.

### The Fix Strategy

**Phase 1 - Encryption Audit Logging (Week 1):**  
Inject `AuditLogsService` into `EncryptionService` and `FileEncryptionService`. Log events: `DATA_ENCRYPTED` (field/file name, success/failure), `DATA_DECRYPTED` (same metadata), `ENCRYPTION_KEY_ROTATED` (severity CRITICAL). Include caller context (user ID, API endpoint) when available. Use LOW severity for routine encrypt/decrypt, HIGH for failures.

**Phase 2 - Complete Key Rotation Workflow (Week 1-2):**  
Refactor `rotateKeys()` to accept a `reEncryptData` boolean parameter. When true, the method should: (1) generate new key, (2) iterate all encrypted database fields using `getSensitiveFields()` mapping, (3) decrypt each with old key and re-encrypt with new key in a transaction, (4) update in-memory master key, (5) log rotation event to audit with CRITICAL severity. Add version column to encrypted data for key versioning during transition.

**Phase 3 - Envelope Encryption for File Keys (Week 2):**  
Modify `FileEncryptionService` to wrap per-file DEKs with the master KEK before returning them. The `EncryptedFile` object should contain `wrappedKey` (DEK encrypted by KEK), `wrappedKeyIv`, and `wrappedKeyTag` instead of plaintext key. On decryption, first unwrap the DEK using the KEK, then use the DEK to decrypt file content. This ensures file keys stored in database are protected.

**Phase 4 - Pure-JavaScript Certificate Generation (Week 2):**  
Replace `execSync(openssl ...)` shell command with `node-forge` library for self-signed certificate generation. Create certificate programmatically: generate RSA key pair, set serial number and validity period, add subject DN with common name `localhost`, self-sign with private key. This eliminates shell execution risk and bash dependency.

**Phase 5 - Key Derivation Function Implementation (Week 3):**  
Implement HKDF (HMAC-based Key Derivation Function) to derive purpose-specific subkeys from master key. Create subkeys for: database field encryption, file encryption, audit log encryption, HMAC signing. Pass context strings (e.g., `zenith-pm-database-encryption`) as HKDF info parameter. This isolates key usage and enables key rotation per-purpose.

### Migration Risk

**Risk Level:** 🟡 MEDIUM

- **Audit Logging:** No breaking changes. Purely additive with no impact on encryption/decryption functionality.
- **Key Rotation Re-encryption:** HIGH RISK operation. Run on staging first with full backup. Implement in batches with checkpointing for large datasets. Test rollback procedure before production.
- **Envelope Encryption:** BREAKING for existing encrypted files. Requires migration script to wrap existing plaintext DEKs. Deploy with dual-read capability (unwrap new format, read old format directly) during transition.
- **Certificate Generation:** Low risk for self-signed dev certificates. Test in development environment first to ensure compatibility.

---

## Module: App

> **Score:** 8.8/10 | **Priority:** 🟡 IMPORTANT  
> **Standard:** OWASP Secure Headers / 12-Factor App Methodology / Kubernetes-Native Application Design

### Current State Summary

The App module demonstrates **excellent security architecture** with Helmet.js (strict CSP), configurable CORS, global rate limiting, ValidationPipe with whitelist mode, Brotli/Gzip compression, and graceful shutdown. However, it has **duplicate module imports** (EncryptionModule, SessionModule imported twice), **missing request size limits** (DoS vulnerability), **test endpoints in production**, a **Redis client leak** in the health controller, and **implicit HSTS configuration** relying on Helmet defaults.

### Industry Standard Target

**How Google/Netflix/Stripe Engineers Build Application Bootstrap Today:**

1. **Zero Duplicate Imports (DRY Principle):** NestJS module system handles dependency caching, but duplicate imports indicate disorganized module structure. Google's internal service frameworks enforce single-import rules via linting.

2. **Request Size Limits (DoS Prevention):** All production APIs MUST enforce request body size limits. Stripe limits JSON payloads to 5MB, AWS API Gateway defaults to 10MB. Unbounded request sizes enable memory exhaustion attacks.

3. **No Debug Endpoints in Production (Attack Surface Reduction):** Test endpoints (test-public, test-simple) should not exist in production builds. Netflix uses environment-based conditional routing to exclude debug routes from production deployments.

4. **Shared Connection Pools (Resource Efficiency):** Database and cache connections should be shared via injected services, not created per-controller. Google Cloud uses singleton connection pools managed by service containers.

5. **Explicit Security Header Configuration (Defense in Depth):** HSTS should be explicitly configured with max-age of 1 year, includeSubDomains, and preload directive for HSTS preload list registration. Cloudflare and major CDNs enforce this standard.

### The Fix Strategy

**Phase 1 - Duplicate Import Removal (Week 1):**  
Audit `app.module.ts` imports array for duplicate entries. Remove the second occurrences of `EncryptionModule` and `SessionModule`. Use NestJS module analyzer or manual review to ensure all modules appear exactly once. Consider grouping imports logically: core infrastructure first, then domain modules.

**Phase 2 - Request Size Limits (Week 1):**  
Configure body-parser middleware with explicit limits: JSON bodies to 10MB (`bodyParser.json({ limit: '10mb' })`), URL-encoded to 10MB, and raw body for webhooks to 50KB. Create separate limits for file upload endpoints using multer with per-file and total size constraints. Log rejected oversized requests for monitoring.

**Phase 3 - Test Endpoint Removal (Week 1):**  
Remove or environment-gate debug endpoints (`test-public`, `test-simple`) in `AppController`. Option A: Delete entirely if not needed. Option B: Wrap in `process.env.NODE_ENV !== 'production'` conditional. Option C: Move to a `DevController` that's only imported in development mode.

**Phase 4 - Health Endpoint Redis Fix (Week 2):**  
Refactor `AppController` to inject `CacheService` instead of creating a new `Redis` client in the constructor. Add a `ping()` method to `CacheService` if not present. This ensures health checks use the shared connection pool and connections are properly cleaned up on shutdown.

**Phase 5 - Explicit HSTS Configuration (Week 2):**  
Update Helmet configuration with explicit `strictTransportSecurity` options: `maxAge: 31536000` (1 year), `includeSubDomains: true`, and `preload: true`. Consider registering the domain on the HSTS preload list (hstspreload.org) after deployment is stable.

### Migration Risk

**Risk Level:** 🟢 LOW

- **Duplicate Import Removal:** No runtime impact. NestJS deduplicates modules internally, so this is purely a code hygiene improvement.
- **Request Size Limits:** May reject previously-accepted large payloads. Audit existing API usage for large requests before deploying. Communicate limits in API documentation.
- **Test Endpoint Removal:** No impact on production functionality. Ensure development workflows don't depend on these endpoints.
- **Health Endpoint Fix:** Low risk—only changes how Redis connection is obtained, not health check logic.
- **HSTS Configuration:** Be cautious with `includeSubDomains` if any subdomains serve HTTP content. Start with main domain only if unsure.

---

## Module: Database

> **Score:** 8.3/10 | **Priority:** 🔴 CRITICAL  
> **Standard:** OWASP Database Security Cheat Sheet / PostgreSQL SSL/TLS Best Practices / 12-Factor App Backing Services

### Current State Summary

The Database module has **excellent infrastructure** (connection pooling, read/write replication, query optimization with Redis caching, statement timeouts, migrations). However, **SSL certificate validation is disabled** (`rejectUnauthorized: false`) enabling MITM attacks, **default password fallbacks** ('password') are dangerous, and the **cache key hash function is weak** (simple JavaScript hash prone to collisions).

### Industry Standard Target

**How Google/AWS/Stripe Engineers Build Database Infrastructure Today:**

1. **Mandatory SSL Certificate Validation (Cloud Security Best Practice):** All production database connections MUST validate server certificates. AWS RDS and Google Cloud SQL provide root CA certificates that MUST be verified. Setting `rejectUnauthorized: false` effectively disables TLS protection entirely.

2. **Fail-Fast Credential Configuration (12-Factor App):** Production environments should NEVER have default credential fallbacks. Missing configuration should cause immediate application failure at startup, not silent fallback to insecure defaults. AWS ECS and Kubernetes enforce this via required environment variables.

3. **Cryptographic Hash Functions for Cache Keys (Collision Prevention):** Cache key generation MUST use cryptographic hash functions (SHA-256) to prevent collisions. Simple hash functions like the DJB2 variant used here have high collision rates for similar inputs, potentially causing cache pollution and incorrect results.

4. **Unified Environment Variable Naming (Operational Clarity):** Database connection parameters should use a single, consistent naming convention (e.g., `DATABASE_*` or `DB_*`, not both). AWS Parameter Store and HashiCorp Vault enforce naming conventions for secrets.

5. **Connection Pool Metrics (Observability):** Production databases should expose connection pool metrics (active connections, idle connections, wait time) for monitoring. Amazon RDS Performance Insights and pgBouncer provide these metrics.

### The Fix Strategy

**Phase 1 - Enable SSL Certificate Validation (Week 1 - CRITICAL):**  
Modify database configuration to set `rejectUnauthorized: true` in production SSL options. For cloud databases (RDS, Cloud SQL), the root CA is typically pre-installed; for self-hosted, provide CA certificate via `DB_SSL_CA` environment variable. Load CA certificate from base64-encoded environment variable or file path. Test connection with `psql --sslmode=verify-full` before deploying.

**Phase 2 - Remove Default Password Fallbacks (Week 1 - CRITICAL):**  
Replace all `configService.get('DATABASE_PASS', 'password')` patterns with `configService.getOrThrow('DATABASE_PASS')` in production mode. For development, allow defaults only when `NODE_ENV !== 'production'`. Add startup validation that throws descriptive errors if required database credentials are missing in production.

**Phase 3 - Cryptographic Cache Key Hashing (Week 1):**  
Replace the custom `hashString()` function in `QueryOptimizerService` with `crypto.createHash('sha256')`. Hash the SQL query concatenated with stringified parameters, then take first 16 characters of hex digest as cache key. This eliminates collision risk while maintaining reasonable key length.

**Phase 4 - Consolidate Environment Variable Naming (Week 2):**  
Standardize on single naming convention: `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASS`, `DATABASE_NAME`. Remove legacy `DB_*` prefixed variables. Update `.env.example`, deployment scripts, and Kubernetes ConfigMaps/Secrets to use new naming. Add migration notes to release documentation.

**Phase 5 - Connection Pool Metrics (Week 2):**  
Integrate Prometheus metrics for connection pool monitoring: `db_pool_active_connections`, `db_pool_idle_connections`, `db_pool_wait_time_seconds`. Use TypeORM's connection pool events or pg-pool's event emitters. Expose via `/metrics` endpoint for scraping by monitoring infrastructure.

### Migration Risk

**Risk Level:** 🟠 HIGH

- **SSL Validation Enablement:** HIGH RISK - may prevent connection if CA certificates are not properly configured. Test extensively in staging with production-equivalent database. Have rollback plan ready.
- **Default Password Removal:** May cause application startup failure if environment variables not properly set. Ensure all deployment pipelines have credentials configured before deploying.
- **Cache Key Hash Change:** Will invalidate ALL existing cache entries (different hash = different keys). Deploy during low-traffic window. Cache will warm up naturally.
- **Environment Variable Rename:** Requires coordinated update across all deployment environments. Use blue-green deployment or support both old and new names temporarily.

---

## Module: Cache

> **Score:** 9.1/10 | **Priority:** 🟡 IMPORTANT  
> **Standard:** Redis Security Best Practices / OWASP Caching Guidelines / Enterprise Redis Deployment Patterns

### Current State Summary

The Cache module is the **most well-designed caching implementation** in the codebase with graceful degradation (continues working when Redis unavailable), tag-based invalidation, namespace organization, auto-pipelining, tiered TTL management, and comprehensive domain helpers. However, **TLS encryption is missing** (0/10), **Redis password is optional** in production (7/10), and the **KEYS command blocks Redis** during namespace flush operations.

### Industry Standard Target

**How Netflix/Stripe/Uber Engineers Build Cache Infrastructure Today:**

1. **Mandatory TLS for Redis (Security Compliance):** All production Redis connections MUST use TLS encryption. AWS ElastiCache and Redis Cloud require TLS by default. Unencrypted Redis traffic exposes session data, cached user information, and application secrets to network sniffers.

2. **Require Authentication in Production (Zero Trust):** Redis AUTH must be mandatory in production. AWS ElastiCache enforces password requirements. An unauthenticated Redis instance is a critical vulnerability—attackers can dump all cached data or execute arbitrary commands.

3. **SCAN Instead of KEYS (Production Safety):** The KEYS command blocks the Redis server until completion, causing timeouts under load. Netflix and Uber use SCAN with cursor-based iteration for all wildcard operations. This is non-negotiable for production Redis.

4. **Circuit Breaker Pattern (Resilience):** Cache operations should be wrapped in circuit breakers to prevent cascading failures when Redis is degraded but not fully down. Hystrix-style patterns with fallback to database are standard.

5. **Cache Hit/Miss Metrics (Observability):** Production cache services expose Prometheus metrics for hit rate, miss rate, latency percentiles, and eviction counts. This enables capacity planning and performance optimization.

### The Fix Strategy

**Phase 1 - Mandatory Redis Password in Production (Week 1):**  
Add startup validation that throws an error if `REDIS_PASSWORD` environment variable is not set when `NODE_ENV === 'production'`. Log a warning in development if password is missing. Update documentation and deployment scripts to require password configuration.

**Phase 2 - Enable TLS for Redis Connections (Week 1):**  
Add TLS configuration to Redis connection options when in production mode. Set `rejectUnauthorized: true` for certificate validation. For cloud Redis (ElastiCache, Redis Cloud), TLS is typically pre-configured; for self-hosted, provide CA certificate via `REDIS_CA_CERT` environment variable. Test with `redis-cli --tls` before deploying.

**Phase 3 - Replace KEYS with SCAN (Week 1):**  
Refactor `flushNamespace()` and `invalidateByTags()` methods to use `scanStream()` instead of `keys()`. Use cursor-based iteration with batched deletes via pipeline. Set `count: 100` for reasonable batch size. This eliminates Redis blocking and ensures production safety at scale.

**Phase 4 - Type Domain Helper Methods (Week 2):**  
Replace `any` types in `cacheUser()`, `getCachedUser()`, `cacheProject()`, and similar methods with proper entity types or DTOs. Create `CachedUser`, `CachedProject`, and `CachedIssues` interface types that represent the cached subset of entity fields. This improves type safety and developer experience.

**Phase 5 - Circuit Breaker Integration (Week 2):**  
Integrate with existing `CircuitBreakerModule` for Redis operations. Wrap cache get/set operations in circuit breaker with fallback to `null` (cache miss). Configure thresholds: 5 failures to open, 30 seconds half-open cooldown, 50% success rate to close. This prevents cache failures from cascading to application failures.

**Phase 6 - Cache Observability Metrics (Week 3):**  
Add Prometheus counters and histograms: `cache_hits_total`, `cache_misses_total`, `cache_operation_duration_seconds`, `cache_evictions_total`. Use existing stats endpoint data or Redis INFO command. Expose via `/metrics` endpoint alongside other application metrics.

### Migration Risk

**Risk Level:** 🟢 LOW

- **Mandatory Password:** May cause startup failure if password not configured. Ensure deployment pipelines have `REDIS_PASSWORD` before deploying. This is correct behavior—failing fast is better than running insecurely.
- **TLS Enablement:** Low risk for cloud Redis (pre-configured). For self-hosted, ensure certificates are valid and accessible.
- **SCAN Replacement:** No functional change—same keys deleted, just using safe iteration. Zero impact to callers.
- **Type Improvements:** TypeScript-only change. No runtime impact. Improves IDE support.

---

## Module: Common

> **Score:** 8.8/10 | **Priority:** 🟡 IMPORTANT  
> **Standard:** Cloud-Native Observability / OWASP Logging Guidelines / 12-Factor App Configuration

### Current State Summary

The Common module provides **excellent foundational utilities** with best-in-class cryptographic token generation (`crypto.randomBytes`), standardized API responses, request correlation via CLS, and configurable rate limiting. However, **alert notifications only log** (no webhook/email/PagerDuty integration), **failure counts are in-memory only** (lost on restart, not shared across instances), and **request IDs are not validated** (potential log injection).

### Industry Standard Target

**How PagerDuty/Datadog/Netflix Engineers Build Common Infrastructure Today:**

1. **Multi-Channel Alert Delivery (Incident Response):** Critical system alerts MUST be delivered through multiple channels: logging (immediate), webhook (Slack/Teams), email (audit trail), and paging system (PagerDuty/OpsGenie) for severity-1 incidents. Netflix's Alert Manager fans out to all configured channels simultaneously.

2. **Distributed State for Failure Tracking (Horizontal Scaling):** Failure counts, circuit breaker state, and rate limit counters MUST be stored in distributed cache (Redis) for multi-instance deployments. Memory-only state means each instance tracks independently, leading to inconsistent alerting thresholds.

3. **Input Validation on Correlation IDs (Security):** Request IDs from upstream (`X-Request-ID` header) should be validated for format (UUID or alphanumeric with length limit) before acceptance. Unvalidated IDs can cause log injection attacks or storage issues with extremely long values.

4. **Typed Error Responses (API Contract):** Error response details should use typed interfaces, not `any`. This prevents accidental exposure of sensitive data in error messages and enables TypeScript compile-time verification of error payloads.

5. **Rate Limit Metrics (Capacity Planning):** Rate limiting decisions should emit metrics: requests accepted, requests rejected, current window usage. This enables capacity planning and identifying clients that frequently hit limits.

### The Fix Strategy

**Phase 1 - Implement Alert Notification Channels (Week 1):**  
Refactor `AlertService.alertHealthDegraded()` to call multiple notification channels. Inject `NotificationsService` and `WebhooksService`. For critical alerts (integration down, sync failures exceeding threshold), send webhook to configured Slack/Teams endpoint, email to ops team, and optionally page on-call via PagerDuty API. Use fire-and-forget with error logging—alert delivery failure should not block the main flow.

**Phase 2 - Distributed Failure Tracking (Week 1):**  
Replace in-memory `failureCount: Map<string, number>` with Redis-backed counters via `CacheService`. Use key pattern `alert:failures:{integrationId}` with TTL matching the monitoring window. On each failure, increment the counter. On success, reset to zero. This ensures consistent failure tracking across all application instances.

**Phase 3 - Request ID Validation (Week 1):**  
Add validation in `CorrelationMiddleware` before accepting upstream request ID. Accept only if: (a) matches UUID format, OR (b) alphanumeric/hyphen with max 64 characters. Reject malformed IDs by generating new UUID. Log warning when rejecting suspiciously long or malformed request IDs for security monitoring.

**Phase 4 - Type Error Response Details (Week 2):**  
Create `ErrorDetails` interface in `http-exception.filter.ts` with explicitly typed fields: `message?: string | string[]`, `error?: string`, `statusCode?: number`. Replace `any` with this interface. Add sanitization to ensure stack traces or internal paths are never included in production error responses.

**Phase 5 - Rate Limit Observability (Week 2):**  
Add Prometheus counters in `ConfigurableThrottlerGuard`: `rate_limit_requests_total{endpoint, status}` (accepted/rejected), `rate_limit_current_usage{endpoint}` (gauge). Export via `/metrics` endpoint. Create Grafana dashboard for rate limit monitoring and alerting on sustained high rejection rates.

### Migration Risk

**Risk Level:** 🟢 LOW

- **Alert Channels:** Purely additive—existing logging continues. New channels are opt-in via configuration.
- **Distributed Failure Tracking:** Behavior change: failure counts now accumulate across restarts and instances. Existing alerts may trigger sooner in clustered deployments. Consider resetting Redis keys during deployment.
- **Request ID Validation:** May reject previously-accepted malformed request IDs from upstream services. Monitor logs for rejection warnings initially.
- **Type Changes:** TypeScript-only, no runtime impact.

---

## Module: Performance

> **Score:** 8.0/10 | **Priority:** 🟡 IMPORTANT  
> **Standard:** HTTP Caching (RFC 7232) / Redis Rate Limiting Patterns / Prometheus Observability Best Practices

### Current State Summary

The Performance module provides **comprehensive API optimization utilities** with smart cache key generation, gzip compression with thresholds, rate limit headers, and response optimization. However, **ETag generation uses timestamp-based weak hash** (defeats cache revalidation purpose), **rate limiting has race conditions** (get + set is not atomic), and **metrics return mock data** (2/10 for observability).

### Industry Standard Target

**How Cloudflare/Netflix/Stripe Engineers Build Performance Infrastructure Today:**

1. **Content-Based ETags (RFC 7232):** ETags MUST be derived from response content hash (MD5 or SHA-256), not timestamps. This enables proper HTTP 304 Not Modified responses when content hasn't changed. Cloudflare generates ETags from content fingerprints, enabling CDN cache revalidation.

2. **Atomic Rate Limiting (Redis INCR Pattern):** Rate limiting counters MUST use atomic increment operations (Redis INCR/INCRBY). The current get-then-set pattern has race conditions where concurrent requests can exceed limits. Stripe uses Redis INCR with EXPIRE for atomic, distributed rate limiting.

3. **Real Metrics Implementation (Prometheus Standard):** Performance metrics MUST be collected from actual application behavior, not mock data. Netflix uses Prometheus counters/histograms for cache hit rate, response time percentiles (p50, p95, p99), and error rates. Mock data leads to incorrect operational decisions.

4. **Response Time Tracking (Distributed Tracing):** Every request should have timing recorded via interceptor. Collect request start time, response completion time, and compute duration. Export as histogram for percentile analysis.

5. **Type-Safe Generics (Developer Experience):** Replace `any` types with generics to enable TypeScript inference through compression/decompression pipelines. This improves IDE support and catches type errors at compile time.

### The Fix Strategy

**Phase 1 - Content-Based ETag Generation (Week 1):**  
Refactor `generateETag()` to accept actual response content instead of content type. Hash the stringified response body using MD5 (fast) or SHA-256 (more secure). Take first 16 characters of hex digest as ETag value. Store ETag with cached response for If-None-Match comparison. Return 304 Not Modified when client ETag matches current content hash.

**Phase 2 - Atomic Rate Limiting with Redis INCR (Week 1):**  
Expose Redis client from `CacheService` or add `increment()` method. Replace `checkRateLimit()` implementation to use Redis INCR command which atomically increments and returns new value. Set TTL with EXPIRE only on first request (when count is 1). This eliminates race conditions and ensures accurate limit enforcement under high concurrency.

**Phase 3 - Real Metrics Implementation (Week 1-2):**  
Inject `MetricsService` or integrate directly with Prometheus client. Replace mock `getPerformanceMetrics()` with actual metric collection: (a) Track cache hits/misses with counters, compute hit rate. (b) Record response times in histogram with labels for endpoint. (c) Track total requests and error counts. Alternatively, use Redis counters with TTL for lightweight metrics if Prometheus not available.

**Phase 4 - Request Timing Interceptor (Week 2):**  
Create `TimingInterceptor` that records `performance.now()` at request start, calculates duration on response, and records to metrics. Add `X-Response-Time` header for client visibility. Export `http_request_duration_seconds` histogram with method, route, and status code labels.

**Phase 5 - Type Generics for Data Methods (Week 2):**  
Replace `any` types in `optimizeResponseData()`, `compressResponse()`, and `decompressResponse()` with generic type parameters. Use `<T>(data: T): T` pattern for optimization, `<T>(data: T): Buffer` for compression, and `<T>(buffer: Buffer): T` for decompression. This enables type inference through the entire pipeline.

### Migration Risk

**Risk Level:** 🟢 LOW

- **Content-Based ETag:** May cause initial cache misses as ETags change format. CDNs and browsers will re-fetch content once, then cache normally. No functional impact.
- **Atomic Rate Limiting:** Fixes a bug—behavior is now correct. May cause stricter enforcement where race conditions previously allowed exceeding limits.
- **Real Metrics:** Replaces mock data with real values. Dashboard values will change. Ensure monitoring alerts are recalibrated.
- **Type Changes:** TypeScript-only, no runtime impact.

---

## Module: Circuit-Breaker

> **Score:** 8.9/10 | **Priority:** 🔴 CRITICAL  
> **Standard:** Netflix Hystrix Pattern / Microsoft Resilience4J / CNCF Resilience Patterns

### Current State Summary

The Circuit-Breaker module uses industry-standard `opossum` library with excellent configuration (timeout, error thresholds, rolling window, event logging, manual controls). However, **a CRITICAL BUG creates new breaker instances per call** instead of reusing existing ones—this breaks the entire circuit breaker pattern. Additionally, **manual trip/reset lacks audit logging** and **no authorization** protects these critical controls.

### Industry Standard Target

**How Netflix/Resilience4J/Microsoft Engineers Build Circuit Breakers Today:**

1. **Singleton Breaker Instances (Core Pattern):** Circuit breakers MUST be singleton per service/endpoint. Netflix Hystrix and Resilience4J maintain a registry of breaker instances by name. Creating new instances per call defeats the purpose—state (failure count, open/closed) is never accumulated.

2. **Audit Trail for Manual Controls (Compliance):** All manual trip/reset operations MUST be logged to audit trail with operator identity, timestamp, and reason. AWS and Google Cloud log all manual overrides to CloudTrail/Cloud Audit Logs for security review.

3. **Authorization for Administrative Controls (Least Privilege):** Manual circuit breaker controls should be restricted to operators with admin permissions. Unprotected trip/reset endpoints can be abused for DoS attacks by malicious internal code.

4. **Prometheus Metrics Export (Observability):** Breaker states should export to Prometheus: `circuit_breaker_state{name, state}`, `circuit_breaker_failures_total`, `circuit_breaker_requests_total`. This enables dashboards and alerting on degraded integrations.

5. **Distributed State for HA (Enterprise Scale):** In multi-instance deployments, consider persisting breaker state in Redis. This ensures all instances share the same view of which circuits are open/closed.

### The Fix Strategy

**Phase 1 - Fix Breaker Instance Reuse (Week 1 - CRITICAL):**  
Refactor `getOrCreateBreaker()` to properly return existing breaker instances from the `breakers` Map when they exist. The current code checks `this.breakers.has(name)` but then creates a new instance anyway—return the existing instance instead. For different actions on the same service, use an `execute()` pattern that fires the passed action through the shared breaker, not creating a new breaker per action.

**Phase 2 - Audit Logging for Manual Controls (Week 1):**  
Inject `AuditLogsService` into `IntegrationGateway`. For `tripBreaker()` and `resetBreaker()`, log audit events with: action (`CIRCUIT_MANUALLY_TRIPPED` / `CIRCUIT_MANUALLY_RESET`), breaker name, operator user ID (passed as parameter), timestamp, and reason. Set severity to HIGH for these administrative actions.

**Phase 3 - Authorization for Manual Controls (Week 1):**  
Add authorization checks before allowing manual trip/reset. Either decorate methods with `@RequirePermission('admin:circuit-breaker')` or add manual check using `RBACService`. Reject unauthorized callers with `UnauthorizedException`. This prevents internal service code from accidentally or maliciously manipulating circuit states.

**Phase 4 - Prometheus Metrics Integration (Week 2):**  
Export circuit breaker state as Prometheus gauge: `circuit_breaker_state{name="github-api"} 1` (1=CLOSED, 0=OPEN, 0.5=HALF_OPEN). Export counters for successes, failures, timeouts, and fallbacks per breaker. Use opossum's event listeners to increment counters on each event.

**Phase 5 - Redis-Backed State for HA (Week 3 - Optional):**  
For high-availability deployments, persist breaker state (open/closed, failure counts) in Redis. On startup, hydrate breaker state from Redis. On state transitions, persist to Redis. This ensures all instances share consistent circuit state. Use `opossum`'s event listeners to trigger persistence.

### Migration Risk

**Risk Level:** 🟡 MEDIUM

- **Instance Reuse Fix:** Behavior change—circuits will now actually accumulate failures and trip as designed. Services that were previously protected by "broken" circuit breakers may now experience actual circuit opening when thresholds are exceeded. This is **correct behavior**, but monitor closely after deployment.
- **Authorization Addition:** May break existing code that calls `tripBreaker()`/`resetBreaker()` without user context. Audit all call sites and ensure they pass authenticated user.
- **Metrics/State Persistence:** Purely additive—no breaking changes.

---

## Module: Tenant

> **Score:** 9.4/10 🏆 | **Priority:** 🟡 IMPORTANT  
> **Standard:** Google Zanzibar Multi-Tenancy / AWS SaaS Factory Tenant Isolation / OWASP Multi-Tenant Security

### Current State Summary

The Tenant module is the **strongest security module** in the codebase with excellent CLS-based request-scoped tenant isolation, automatic query filtering, write validation with `ForbiddenException`, and soft-delete integration. However, **bypass operations lack audit logging** (critical for compliance), the **@BypassTenantScope decorator is not wired** to actually enable bypass, and **remove operations don't validate tenant ownership** (assumes entity was loaded with filter).

### Industry Standard Target

**How Google/AWS/Salesforce Engineers Build Multi-Tenant Systems Today:**

1. **Audit Logging for All Bypass Operations (Compliance):** Every tenant scope bypass MUST be logged with operator identity, reason, and timestamp. AWS CloudTrail and Salesforce Shield log all privilege escalations. This is mandatory for SOC 2, HIPAA, and enterprise compliance.

2. **Decorator-Based Bypass with Guard Integration (Developer Experience):** Decorators like `@BypassTenantScope` should automatically work via guard/interceptor. The current implementation sets metadata but nothing reads it. Google's internal frameworks wire decorators to middleware automatically.

3. **Defense in Depth for Remove Operations (Zero Trust):** Even if entities are expected to be pre-loaded with tenant filter, remove operations SHOULD validate tenant ownership. This prevents bugs where entities are passed from different contexts. AWS IAM always validates permissions at operation time.

4. **Row-Level Security at Database Layer (Ultimate Protection):** For maximum security, implement PostgreSQL Row-Level Security (RLS) policies that enforce tenant isolation at the database level. This protects against application bugs that might bypass the repository layer.

5. **Unsafe Manager Access Deprecation (Security Hygiene):** Escape hatches like `manager` getter should be clearly deprecated and logged. Developers should use explicit bypass patterns with audit trail instead of direct manager access.

### The Fix Strategy

**Phase 1 - Bypass Audit Logging (Week 1 - CRITICAL for Compliance):**  
Modify `enableBypass()` and `disableBypass()` methods in `TenantContextService` to accept `userId` and `reason` parameters. Inject `AuditLogsService` and log events: `TENANT_BYPASS_ENABLED` and `TENANT_BYPASS_DISABLED` with HIGH severity. Include the reason, user ID, and current request context (endpoint, HTTP method). This creates audit trail for compliance reviews.

**Phase 2 - Wire @BypassTenantScope Decorator (Week 1):**  
Create `TenantBypassGuard` that reads `BYPASS_TENANT_SCOPE_KEY` metadata using Reflector. If decorator is present, call `tenantContext.enableBypass()` with request user and reason extracted from handler name. Register guard globally or ensure it's applied on controllers using the decorator. Add integration test to verify decorator actually enables bypass.

**Phase 3 - Validate Tenant on Remove Operations (Week 1):**  
Add `validateTenantOnWrite()` call in `TenantRepository.remove()` method before delegating to underlying repository. For array removes, validate each entity. Throw `ForbiddenException` if entity's tenant doesn't match current context. This adds defense-in-depth even when entities were ostensibly loaded with filters.

**Phase 4 - Deprecate Manager Getter (Week 2):**  
Rename `get manager()` to `getUnsafeManager(reason: string)`. Add `@deprecated` JSDoc annotation. Log a warning with the reason when accessed. Update all existing usages to provide reasons. Consider adding eslint rule to flag direct manager access.

**Phase 5 - Database Row-Level Security (Week 3 - Optional):**  
Implement PostgreSQL RLS policies for tenant isolation. Create policy: `CREATE POLICY tenant_isolation ON [table] USING (organization_id = current_setting('app.current_tenant'))`. Set tenant context via `SET LOCAL app.current_tenant = ?` on connection checkout. This provides database-layer protection against application bugs.

### Migration Risk

**Risk Level:** 🟢 LOW

- **Bypass Audit Logging:** Purely additive—no functional change to bypass behavior.
- **Decorator Wiring:** May cause bypass to work where it previously silently failed. Audit existing `@BypassTenantScope` usages to ensure intentional.
- **Remove Validation:** May cause `ForbiddenException` for previously-working remove operations that bypassed tenant context. This is correct behavior—surfaces bugs.
- **RLS Policies:** Database migration risk. Test extensively in staging. Ensure connection pool properly sets tenant context.

---

## Module: Projects

> **Score:** 8.5/10 | **Priority:** 🔴 CRITICAL  
> **Standard:** OWASP CSRF Prevention / SOC 2 Audit Logging / Domain-Driven Design Bounded Context

### Current State Summary

The Projects module demonstrates **excellent authorization architecture** with triple-layer guards (JWT + Permission + ProjectRole), TenantRepository for automatic isolation, comprehensive caching with invalidation, and per-project security policies. However, **CSRF protection is completely missing** (0/10) on all state-changing endpoints, **project creation is not audited** (compliance gap), **access settings changes only use logger** (not AuditService), and the **security policy cache is in-memory only** (not distributed).

### Industry Standard Target

**How Atlassian/GitHub/GitLab Engineers Build Project Management Systems Today:**

1. **Universal CSRF Protection (OWASP Requirement):** All state-changing project operations (create, update, delete, archive) MUST be CSRF-protected. Jira applies CSRF tokens to all form submissions. Project deletion without CSRF protection is a critical vulnerability.

2. **Complete Audit Trail for CRUD Operations (SOC 2):** Every create, update, and delete on core business entities MUST be logged to the audit trail. GitHub logs all repository creation, settings changes, and deletions for compliance. The current gap where creation isn't audited breaks audit completeness.

3. **Consistent Audit Service Usage (Auditability):** Security-critical operations like access settings changes should use the centralized `AuditService`, not local logger. This ensures all audit events flow to the same destination (database, SIEM) with consistent schema.

4. **Distributed Cache for Security Data (Horizontal Scaling):** Security policies that affect access decisions MUST use distributed cache (Redis) in multi-instance deployments. In-memory `Map` causes inconsistent enforcement when policies change.

5. **Input Validation for Foreign Keys (Defense in Depth):** Foreign key references like `projectLeadId` should validate format (UUID) at the DTO layer. Invalid UUIDs bypassing validation could cause database errors or injection if used in raw queries.

### The Fix Strategy

**Phase 1 - CSRF Protection for All Endpoints (Week 1 - CRITICAL):**  
Add `CsrfGuard` to `ProjectsController` at the class level, positioned after `JwtAuthGuard` in the guard chain. This protects `create()`, `update()`, `remove()`, `archive()`, and `updateAccessSettings()` endpoints. Coordinate with frontend to ensure CSRF token is sent with all project management requests. The current 0/10 CSRF score is a critical vulnerability.

**Phase 2 - Complete Audit Logging (Week 1):**  
Add `AuditLogsService.log()` calls for: (a) `PROJECT_CREATED` with severity MEDIUM in `create()` method—include project name, key, template ID, and creator. (b) `ACCESS_SETTINGS_UPDATED` with severity HIGH in `updateAccessSettings()`—include the specific changes made. (c) `PROJECT_UPDATED` with severity LOW in `update()` method—track field changes. This achieves audit trail completeness for SOC 2 compliance.

**Phase 3 - UUID Validation for Foreign Keys (Week 1):**  
Replace `@IsString()` with `@IsUUID()` decorator on `projectLeadId`, `templateId`, and any other entity reference fields in DTOs. This prevents malformed IDs from reaching the service layer. Add similar validation to `UpdateProjectDto` for consistency.

**Phase 4 - Distributed Security Policy Cache (Week 2):**  
Replace in-memory `Map<string, {policy, timestamp}>` in `ProjectSecurityPolicyService` with Redis-backed caching via `CacheService`. Use key pattern `project:{id}:security-policy` with 30-second TTL (matching current behavior). On policy update, explicitly invalidate the cache key. This ensures consistent policy enforcement across all application instances.

**Phase 5 - Input Sanitization for Rich Text (Week 2):**  
Add XSS sanitization for the `description` field which may contain rich text or markdown. Use a library like `DOMPurify` or `xss` to strip dangerous tags/attributes before storage. Create a `@Sanitize()` decorator or pipe for reuse across modules.

### Migration Risk

**Risk Level:** 🟢 LOW

- **CSRF Guard Addition:** May cause 403 errors for project management requests missing CSRF token. Frontend must be updated. This is correct security behavior—roll out with monitoring.
- **Audit Logging:** Purely additive—no functional change. Increases audit log volume but provides compliance value.
- **UUID Validation:** May reject previously-accepted invalid projectLeadId values. Audit existing projects for data quality issues before deploying.
- **Redis Policy Cache:** Behavior change from in-memory. First request after deployment will incur cache miss. Minimal impact.

---

## Module: Issues

> **Score:** 9.0/10 🏆 | **Priority:** 🔴 CRITICAL  
> **Standard:** OWASP CSRF Prevention / NIST AC-3 / Event Sourcing Best Practices / Atlassian Jira Architecture

### Current State Summary

The Issues module is the **most feature-complete module** (1700+ lines) with exceptional implementation: quad-layer authorization (JWT + Permission + ProjectRole + CASL), optimistic locking via `@VersionColumn`, real-time WebSocket broadcasting, workflow state machine validation, and comprehensive Redis caching. However, **CSRF protection is completely missing** (0/10), the **CSV import endpoint has no file size limit** (DoS vulnerability), **no rate limiting on import** (abuse potential), and **EventEmitter is used instead of AuditService** (events may not persist).

### Industry Standard Target

**How Atlassian/Linear/Asana Engineers Build Issue Tracking Systems Today:**

1. **Universal CSRF Protection (OWASP Requirement):** All issue mutations (create, update, delete, move, import) MUST be CSRF-protected. Jira requires CSRF tokens on all POST/PUT/DELETE requests. Issue deletion without CSRF is a critical vulnerability allowing attackers to destroy project data via forged requests.

2. **Import Endpoint Hardening (DoS Prevention):** File import endpoints are prime DoS targets. Jira enforces: (a) file size limits (typically 5-10MB), (b) rate limiting (5 imports per minute per user), (c) row count limits per file (10,000 max). Without these, an attacker can exhaust memory or CPU with malicious CSV files.

3. **Dual Track Eventing (Reliability + Real-Time):** Critical business events should use both: EventEmitter for real-time WebSocket broadcasting AND `AuditService` for persistent audit trail. EventEmitter subscribers can fail silently; AuditService provides durable, queryable compliance records.

4. **Typed Metadata Schema (Data Integrity):** JSONB metadata columns should have TypeScript interfaces defining allowed structure. This prevents arbitrary data injection and enables schema validation. Linear uses strict schemas for custom fields.

5. **Batch Operation Optimization (Performance):** Bulk operations (move, update, delete) should use optimized SQL (CASE statements, CTEs) rather than N+1 loops. The current implementation does this well with bulk reordering.

### The Fix Strategy

**Phase 1 - CSRF Protection for All Endpoints (Week 1 - CRITICAL):**  
Add `CsrfGuard` to `IssuesController` at the class level. The guard must be positioned after `JwtAuthGuard` but before `PermissionsGuard` in the chain. This protects all 12+ mutation endpoints: `create()`, `update()`, `remove()`, `moveToColumn()`, `updatePosition()`, `importIssues()`, `bulkUpdate()`, etc. The import endpoint is especially dangerous—a forged request could inject thousands of malicious issues.

**Phase 2 - CSV Import File Size Limit (Week 1 - CRITICAL):**  
Add `MaxSizeValidator` to the `ParseFilePipeBuilder` chain with 5MB limit (sufficient for ~50,000 rows). This prevents memory exhaustion attacks where malicious actors upload gigabyte-sized files. Also add row count validation in the import service—reject files with more than 10,000 rows with descriptive error.

**Phase 3 - Rate Limiting on Import Endpoint (Week 1):**  
Add `@Throttle({ default: { limit: 5, ttl: 60000 } })` decorator to the `importIssues()` endpoint specifically. This allows 5 imports per minute per user. Also add global project-level rate limiting: maximum 20 imports per hour per project to prevent abuse even with multiple user accounts.

**Phase 4 - AuditService Integration (Week 2):**  
Alongside existing EventEmitter calls, add `AuditLogsService.log()` for critical operations: `ISSUE_CREATED` (medium severity), `ISSUE_UPDATED` (low severity), `ISSUE_DELETED` (high severity), `ISSUE_IMPORTED` (high severity—bulk operation), `ISSUE_MOVED` (low severity). Include actor ID, project ID, issue ID, and relevant metadata. This creates a durable audit trail independent of event subscriber reliability.

**Phase 5 - Typed Metadata Interface (Week 2):**  
Create `IssueMetadata` interface defining allowed structure: `customFields?: Record<string, string | number | boolean>`, `externalIds?: { source: string; id: string }[]`, `importSource?: string`. Replace `Record<string, any>` in entity. Add validation in service to reject non-conforming metadata on create/update.

### Migration Risk

**Risk Level:** 🟢 LOW

- **CSRF Guard Addition:** May cause 403 errors for issue operations missing CSRF token. Frontend must be updated. Critical security fix—roll out with monitoring.
- **File Size Limit:** May reject previously-accepted large CSV files. Communicate new limits in documentation and error messages.
- **Rate Limiting:** Heavy importers may hit limits. Consider higher limits for admin users or implement queue-based async import for large files.
- **AuditService Integration:** Purely additive. Existing EventEmitter behavior remains unchanged.
- **Typed Metadata:** May reject existing issues with non-conforming metadata on update. Run migration script to validate/clean existing data first.

---

## Module: Boards

> **Score:** 8.0/10 | **Priority:** 🔴 CRITICAL  
> **Standard:** OWASP WebSocket Security / Real-Time Collaboration Security / Parameterized SQL Best Practices

### Current State Summary

The Boards module provides **excellent Kanban/Scrum functionality** with micro-caching (5-second TTL for standup storms), slim endpoints excluding heavy fields, optimized bulk operations using single CASE queries, real-time WebSocket broadcasting with room-based scoping, and dual permission gates. However, **CSRF protection is completely missing** (0/10), **WebSocket gateway has no authentication** (any client can connect and join any room), **CORS is wildcard** (`origin: '*'`), and **SQL bulk operations use direct string interpolation** (injection risk).

### Industry Standard Target

**How Linear/Notion/Figma Engineers Build Real-Time Collaborative Boards Today:**

1. **WebSocket Authentication on Handshake (Security Standard):** All WebSocket connections MUST validate JWT token during the handshake phase before allowing connection. Figma and Notion disconnect unauthenticated clients immediately. Socket.IO supports `auth` tokens in handshake configuration. Additionally, room join requests MUST verify project membership.

2. **CORS Restriction for WebSockets (Origin Validation):** WebSocket gateways MUST NOT use `origin: '*'` in production. This allows any website to connect and potentially exfiltrate real-time data. Configure CORS to match the main application's CORS settings using environment variables.

3. **Parameterized SQL for All Queries (SQL Injection Prevention):** Even when inputs are validated by NestJS pipes, SQL queries MUST use parameterized VALUES clauses for bulk operations. The current pattern of `'${id}'` string interpolation violates defense-in-depth. PostgreSQL VALUES clause with typed parameters is the safe approach.

4. **Universal CSRF Protection (OWASP Requirement):** All board mutations (create, delete, move issue, reorder columns) must be CSRF-protected. Board deletion without CSRF protection allows attackers to destroy project infrastructure via forged requests.

5. **Room Membership Validation (Authorization):** WebSocket room joins should validate that the user is actually a member of the target project. Without this, authenticated users can join rooms for projects they don't belong to.

### The Fix Strategy

**Phase 1 - WebSocket Authentication (Week 1 - CRITICAL):**  
Modify `BoardsGateway.handleConnection()` to extract JWT from `socket.handshake.auth.token`. Validate token using `JwtService.verify()`. On failure, immediately call `socket.disconnect()` and return. On success, decode the token and store `userId` in `socket.data` for later authorization checks. This prevents unauthenticated clients from receiving any real-time updates.

**Phase 2 - Room Join Authorization (Week 1 - CRITICAL):**  
Create `@SubscribeMessage('join-board')` handler that validates project membership before allowing room join. Call `membersService.getUserRole(projectId, socket.data.userId)`. If null (not a member), emit error event and refuse join. Only allow room join for authenticated members. This prevents cross-project information leakage.

**Phase 3 - CORS Restriction (Week 1):**  
Replace `cors: { origin: '*' }` with `cors: { origin: process.env.CORS_ORIGIN, credentials: true }` in gateway decorator. Ensure frontend sends credentials with WebSocket handshake. This prevents cross-origin WebSocket connections from malicious websites.

**Phase 4 - CSRF Protection for Controller (Week 1):**  
Add `CsrfGuard` to `BoardsController` at the class level. This protects `create()`, `update()`, `remove()`, `moveIssue()`, `reorderColumns()`, and `reorderIssues()` endpoints. Coordinate with frontend to ensure CSRF token accompanies all board mutation requests.

**Phase 5 - Parameterized Bulk SQL (Week 2):**  
Refactor `reorderColumns()` and `reorderIssues()` in `BoardsService` to use parameterized VALUES clause instead of string interpolation. Build parameters array with alternating UUID and order values, then use `$1::uuid, $2::int` style placeholders. This eliminates SQL injection risk even if input validation is bypassed.

**Phase 6 - Cache Invalidation on Mutations (Week 2):**  
Add explicit cache invalidation calls after board structure mutations (column add/remove, issue move). Use `cacheService.del()` with board-specific keys. Currently, micro-cache (5s TTL) handles eventual consistency, but explicit invalidation provides immediate consistency for the actor.

### Migration Risk

**Risk Level:** 🟡 MEDIUM

- **WebSocket Authentication:** Will disconnect all existing WebSocket connections on deployment. Frontend must be updated to send JWT in handshake.auth. Coordinate deployment with frontend release.
- **Room Join Authorization:** May prevent some users from joining if membership checks fail unexpectedly. Add logging to monitor join failures.
- **CORS Restriction:** Breaks connections from development environments if CORS_ORIGIN not configured correctly. Test thoroughly in staging.
- **CSRF Guard:** Standard risk—frontend coordination required.
- **SQL Parameterization:** Purely defensive—no functional change if inputs are valid.

---

## Module: Sprints

> **Score:** 8.7/10 | **Priority:** 🔴 CRITICAL  
> **Standard:** Atlassian Agile Metrics / Scrum Guide / Multi-Tenant Security Patterns

### Current State Summary

The Sprints module is **exceptionally comprehensive** with industry-grade Agile/Scrum functionality: burndown/burnup charts with daily snapshots via cron, velocity tracking over last 5 sprints, transactional issue operations, Jira-style archival (move incomplete to next/backlog), bulk updates using `In()` operator, and smart defaults learning. However, **CSRF protection is completely missing** (0/10), the **velocity query bypasses tenant repository** (uses raw projectRepo instead of tenantProjectRepo), and **metrics return `any` type** losing type safety.

### Industry Standard Target

**How Atlassian/Monday.com/Asana Engineers Build Sprint Management Today:**

1. **Universal CSRF Protection (OWASP Requirement):** All sprint lifecycle mutations (create, start, archive, delete, add/remove issues) MUST be CSRF-protected. Jira requires CSRF tokens on all sprint operations. Starting a sprint via forged request could disrupt entire team workflows.

2. **Consistent Tenant Isolation (Zero Trust):** ALL queries accessing project or org-scoped data MUST use tenant-aware repositories. The current inconsistency where velocity uses raw `projectRepo` while other methods use `tenantProjectRepo` creates a potential cross-tenant data access vulnerability. Defense in depth requires consistent patterns.

3. **Typed API Contracts (TypeScript Best Practices):** Metrics endpoints returning complex aggregated data MUST have typed interfaces. This enables frontend type safety, API documentation generation, and prevents accidental exposure of internal data structures. Linear uses typed responses for all analytics.

4. **Cron Job Documentation (Operational Clarity):** System-wide queries that intentionally bypass tenant isolation (like `findAllActiveSystemWide` for cron jobs) should be clearly documented with `@internal` JSDoc tags and restricted from external exposure.

5. **Metrics Caching (Performance):** Burndown and velocity calculations involve historical aggregations. Results should be cached with appropriate TTL (5-15 minutes) to handle dashboard refresh storms.

### The Fix Strategy

**Phase 1 - CSRF Protection for All Endpoints (Week 1 - CRITICAL):**  
Add `CsrfGuard` to `SprintsController` at the class level, positioned after `JwtAuthGuard`. This protects all lifecycle mutations: `create()`, `update()`, `remove()`, `startSprint()`, `archiveSprint()`, `addIssue()`, `removeIssue()`. Sprint state changes affect project planning integrity—CSRF protection is essential.

**Phase 2 - Fix Velocity Tenant Isolation (Week 1):**  
Replace `this.projectRepo.findOne()` with `this.tenantProjectRepo.findOne()` in `getVelocity()` method. This ensures the velocity query respects tenant context and prevents potential cross-org data access. Audit all other service methods for similar inconsistencies.

**Phase 3 - Type Metrics Return Values (Week 1):**  
Create interfaces for metrics responses: `BurndownResponse` (sprint, snapshots array, idealBurnRate, initialScope), `BurnupResponse` (sprint, snapshots, scopeCreepPercentage), `VelocityResponse` (sprintHistory array, averageVelocity, trend). Replace `Promise<any>` with these typed promises. This improves API documentation and frontend integration.

**Phase 4 - Document System-Wide Queries (Week 2):**  
Add comprehensive JSDoc to `findAllActiveSystemWide()` with `@internal` tag, explanation of intentional tenant bypass, and warning against external usage. Consider adding `@Hidden()` decorator to prevent OpenAPI exposure if using Swagger.

**Phase 5 - Metrics Caching (Week 2):**  
Add Redis caching for burndown/burnup/velocity endpoints. Use cache key pattern `sprint:{id}:burndown` with 5-minute TTL. Invalidate on sprint snapshot creation (cron job). This handles standup meeting "dashboard refresh storm" efficiently.

### Migration Risk

**Risk Level:** 🟢 LOW

- **CSRF Guard Addition:** Standard risk—frontend coordination required. May cause 403 errors until frontend sends CSRF tokens with sprint requests.
- **Tenant Isolation Fix:** Purely defensive. May cause 404 or forbidden errors if velocity was previously returning cross-tenant data (which would be a bug fix, not a regression).
- **Typed Returns:** TypeScript-only change. No runtime impact. Improves IDE support and catches frontend integration errors at compile time.
- **Caching:** Purely additive performance improvement. Metrics may be up to 5 minutes stale—acceptable for dashboard use cases.

---

## Module: Comments

> **Score:** 6.5/10 | **Priority:** 🔴 CRITICAL  
> **Standard:** OWASP XSS Prevention / User-Generated Content Security / Rate Limiting Best Practices

### Current State Summary

The Comments module is **compact and functional** with permission-based access, author ownership checks, PROJECT_LEAD override, and watcher notifications for all events. However, it has **multiple critical security gaps**: no CSRF protection (0/10), **no XSS sanitization** (0/10 - stored XSS vulnerability), no content length limit (DoS risk), no pagination (OOM on issues with many comments), no audit logging, and no rate limiting (spam potential).

### Industry Standard Target

**How GitHub/Slack/Discourse Engineers Build Comment Systems Today:**

1. **XSS Sanitization (OWASP Critical):** All user-generated content MUST be sanitized before storage. GitHub uses `DOMPurify` to strip dangerous tags. Stored XSS allows attackers to inject persistent malicious scripts that execute when other users view comments—this is a critical vulnerability.

2. **Content Length Limits (DoS Prevention):** Comments should have max length (typically 10,000-65,000 characters). Slack limits messages to 40,000 characters. Without limits, attackers can submit multi-megabyte comments causing database bloat and memory exhaustion on retrieval.

3. **Pagination (Scalability):** Comments MUST be paginated. Issues with 1000+ comments will cause OOM errors if loaded all at once. GitHub loads 50 comments per page with infinite scroll. This is both a performance and availability concern.

4. **Rate Limiting (Spam Prevention):** Comment creation should be rate-limited to prevent automated spam. Discourse limits to 10 comments per minute per user. Without rate limiting, attackers or bots can flood issues with spam.

5. **Soft Delete (Data Recovery):** Comments should use soft delete for audit trail and recovery. Hard delete loses data permanently. Consider "edited" and "edited_at" fields for edit history.

### The Fix Strategy

**Phase 1 - XSS Sanitization (Week 1 - CRITICAL):**  
Add `sanitize-html` library integration to `CommentsService.create()` and `update()` methods. Configure allowed tags whitelist (typically: b, i, em, strong, a, code, pre, blockquote, ul, ol, li). Strip all other tags and attributes. For `<a>` tags, only allow `href` attribute with `http/https` protocols. This eliminates stored XSS vulnerability.

**Phase 2 - CSRF Protection (Week 1 - CRITICAL):**  
Add `CsrfGuard` to `CommentsController` at the class level. This protects create, update, and delete endpoints. Without CSRF protection, attackers can post malicious comments or delete legitimate ones via forged requests from other websites.

**Phase 3 - Content Length Limit (Week 1):**  
Add `@MaxLength(10000)` decorator to `content` field in `CreateCommentDto` and `UpdateCommentDto`. This prevents database bloat and memory exhaustion. 10KB is sufficient for detailed technical comments while preventing abuse.

**Phase 4 - Pagination (Week 1):**  
Refactor `findAll()` to use `findAndCount()` with `skip` and `take` parameters. Add `page` and `limit` query params to the controller GET endpoint. Return paginated response with `comments`, `total`, `page`, and `totalPages`. Default to 50 comments per page with max 100.

**Phase 5 - Rate Limiting (Week 2):**  
Add `@Throttle({ default: { limit: 10, ttl: 60000 } })` decorator to the `create()` endpoint specifically. This allows 10 comments per minute per user—sufficient for legitimate use while preventing spam floods.

**Phase 6 - Audit Logging (Week 2):**  
Inject `AuditLogsService` and log `COMMENT_CREATED`, `COMMENT_UPDATED`, and `COMMENT_DELETED` events. Include actor ID, issue ID, and content length (not full content for privacy). This creates audit trail for abuse investigation.

### Migration Risk

**Risk Level:** 🟢 LOW

- **XSS Sanitization:** May strip formatting from existing comments containing advanced HTML. Consider running migration to sanitize existing content or apply sanitization on display.
- **Content Length Limit:** May reject previously-accepted very long comments on edit. Analyze existing data for outliers before enforcing.
- **Pagination:** Breaking API change for clients expecting full array. Version the endpoint or document breaking change.
- **Rate Limiting:** May affect power users who comment frequently. Consider higher limits for PROJECT_LEAD role.

---

## Module: Attachments

> **Score:** 5.5/10 ⚠️ | **Priority:** 🔴 CRITICAL  
> **Standard:** OWASP File Upload Security / ClamAV Integration / AWS S3 Secure Upload Patterns

### Current State Summary

The Attachments module supports multi-target uploads (project/issue/release/sprint/comment) with 10MB size limit and comprehensive AttachmentHistory audit trail. However, it has **catastrophic security gaps**: accepts **ALL file types** (0/10 - ransomware/malware risk), **no CSRF protection** (0/10), **filename not sanitized** (path traversal risk), **no virus scanning** (0/10 - malware distribution risk), and download uses raw file paths. This is the **lowest-scoring module** and highest security priority.

### Industry Standard Target

**How Dropbox/Google Drive/AWS S3 Engineers Build File Upload Systems Today:**

1. **Strict MIME Type Whitelist (Security Baseline):** File uploads MUST validate against explicit whitelist of allowed MIME types. Dropbox blocks executables (.exe, .bat, .sh), server scripts (.php, .jsp), and other dangerous types. The current `cb(null, true)` accepts everything—catastrophic.

2. **Magic Number Validation (Deep Content Check):** Don't trust client-provided MIME types. Validate actual file content by checking magic bytes (file signatures). A .jpg renamed to .txt should be detected. Libraries like `file-type` read actual file headers.

3. **Virus Scanning (Enterprise Requirement):** All uploaded files MUST be scanned for malware before storage. AWS recommends ClamAV integration. Google Drive scans all files. This is a SOC 2/HIPAA requirement for enterprise SaaS.

4. **Filename Sanitization (Path Traversal Prevention):** Original filenames MUST be sanitized using `sanitize-filename` library. Strip `../`, null bytes, and OS-restricted characters. Store with UUID-based names, preserve original for display only.

5. **Path Traversal Defense (Belt and Suspenders):** Even with sanitization, validate that resolved file paths stay within the uploads directory. Use `path.resolve()` and verify prefix. Never trust filename from database without validation.

6. **Cloud Storage with Presigned URLs (Scalability):** Production should use S3/GCS with presigned URLs for uploads and downloads. This eliminates local disk management, provides encryption at rest, and scales infinitely.

### The Fix Strategy

**Phase 1 - File Type Whitelist (Week 1 - CRITICAL):**  
Replace `cb(null, true)` in fileFilter with explicit MIME type whitelist. Allow: images (jpeg, png, gif, webp, svg), documents (pdf, doc/docx, xls/xlsx, ppt/pptx, txt, csv), and archives (zip with scanning). Reject all executable types (.exe, .bat, .sh, .php, .js, .dll). Return clear error message indicating allowed types.

**Phase 2 - CSRF Protection (Week 1 - CRITICAL):**  
Add `CsrfGuard` to `AttachmentsController` at the class level. This protects all upload and delete endpoints. File upload via CSRF could fill disk storage or inject malicious files.

**Phase 3 - Filename Sanitization (Week 1 - CRITICAL):**  
Install `sanitize-filename` library. In Multer filename callback, sanitize original filename before appending to unique prefix. Replace spaces with underscores. Limit filename length (255 chars). Store sanitized version in database but preserve original for display.

**Phase 4 - Path Traversal Defense (Week 1):**  
In download handler, use `path.basename()` on filename before joining with uploads directory. Then verify that `path.resolve()` result starts with uploads directory path. Throw `ForbiddenException` if path traversal detected. This is defense-in-depth after sanitization.

**Phase 5 - Magic Number Validation (Week 2):**  
Add `file-type` library check after Multer saves file. Read magic bytes from saved file and compare against allowed types. If mismatch (e.g., .exe renamed to .pdf), delete file and return error. This catches client-side type spoofing.

**Phase 6 - Virus Scanning (Week 2-3):**  
Integrate ClamAV via `clamscan` library. After upload but before saving metadata, scan file. If infected, delete file, log security event, and return error. For cloud deployments, consider AWS-native malware scanning with S3 Object Lambda.

**Phase 7 - Cloud Storage Migration (Week 4+ - Optional):**  
Migrate to S3/GCS for production. Use presigned URLs for direct upload/download. Enable server-side encryption. Add lifecycle policies for retention. This eliminates local disk management and provides enterprise-grade durability.

### Migration Risk

**Risk Level:** 🟡 MEDIUM

- **File Type Whitelist:** Will reject previously-allowed file types. Audit existing attachments for uncommon types before deploying. Communicate allowed types in UI.
- **CSRF:** Standard frontend coordination required.
- **Filename Sanitization:** Existing files may have unsanitized names. Run migration to sanitize database records. Keep original names for display.
- **Virus Scanning:** ClamAV requires additional infrastructure (daemon process or container). Consider cloud-based scanning for simpler deployment.
- **Cloud Migration:** Major architecture change. Requires data migration and URL updates. Plan carefully.

---

## Module: Releases

> **Score:** 8.2/10 | **Priority:** 🔴 CRITICAL  
> **Standard:** GitOps Deployment Patterns / OWASP SSRF Prevention / Semantic Versioning Best Practices

### Current State Summary

The Releases module is **feature-rich** with excellent capabilities: PROJECT_LEAD role enforcement, semver validation with regex, Git integration (tag/branch/commit/provider), automated release notes generation from linked issues, rollback tracking, and release comparison. However, **CSRF protection is missing** (0/10), **release attachments have no file type or size limits** (like the Attachments module), **the deployment webhook handler is not validated** (SSRF risk when implemented), and **pagination is missing** for release lists.

### Industry Standard Target

**How GitHub/GitLab/CircleCI Engineers Build Release Management Systems Today:**

1. **Universal CSRF Protection (OWASP Requirement):** All release mutations (create, update, delete, deploy, rollback) MUST be CSRF-protected. Deployment triggers via CSRF are particularly dangerous—attackers could deploy buggy or malicious versions to production via forged requests.

2. **Webhook URL Validation (SSRF Prevention):** Deployment webhooks MUST validate target URLs against an allowlist of approved domains (CI/CD providers like GitHub Actions, Jenkins, GitLab CI). Open webhook URLs enable Server-Side Request Forgery (SSRF)—attackers can probe internal infrastructure. Also enforce timeouts and disable redirects.

3. **Release Attachment Security (Consistency):** Release attachments should have the same security controls as the main Attachments module: file type whitelist, size limits (larger for releases—50MB for build artifacts), filename sanitization. Release artifacts are particularly sensitive as they may be deployed.

4. **Deployment Approval Workflow (Enterprise):** Critical releases to production should support multi-stage approval. GitHub requires branch protection rules. At minimum, log all deployment triggers to audit trail for compliance.

5. **Pagination for Release History (Scalability):** Long-running projects accumulate hundreds of releases. Lists MUST be paginated to prevent memory issues. Consider cursor-based pagination for real-time consistency.

### The Fix Strategy

**Phase 1 - CSRF Protection for All Endpoints (Week 1 - CRITICAL):**  
Add `CsrfGuard` to `ReleasesController` at the class level. This protects: `create()`, `update()`, `remove()`, `uploadAttachment()`, `triggerDeploy()`, and `createRollback()`. Deployment triggers without CSRF are especially dangerous—an attacker could deploy any release to production via forged request.

**Phase 2 - Release Attachment Security (Week 1):**  
Add file filter and size limits to the `uploadAttachment()` endpoint's Multer configuration. Allow: images (for screenshots), PDFs (documentation), ZIPs/tarballs (build artifacts), plain text. Set 50MB limit (larger than issue attachments for build artifacts). Add UUID-based filename sanitization consistent with main Attachments module.

**Phase 3 - Deployment Webhook Validation (Week 2 - CRITICAL):**  
When implementing the `triggerDeploy()` webhook functionality: (a) Validate webhookId exists and belongs to the project. (b) Maintain an allowlist of approved webhook domains (github.com, gitlab.com, jenkins.io, circleci.com). (c) Reject webhooks to non-approved domains. (d) Set HTTP timeout (10 seconds). (e) Disable following redirects. (f) Log all deployment triggers to AuditService with HIGH severity.

**Phase 4 - UUID Validation for Issue Links (Week 1):**  
Replace `@IsString()` with `@IsUUID()` decorator on `issueId` fields in `AssignIssueDto` and related DTOs. This prevents malformed IDs from reaching the service layer.

**Phase 5 - Pagination for Release Lists (Week 2):**  
Refactor `findAll()` to use `findAndCount()` with `skip` and `take` parameters. Add `page` and `limit` query params to controller. Return paginated response with `releases`, `total`, `page`, and `totalPages`. Default to 20 releases per page.

**Phase 6 - Deployment Audit Logging (Week 2):**  
Add `AuditLogsService.log()` calls for: `RELEASE_CREATED`, `RELEASE_DEPLOYED` (HIGH severity), `RELEASE_ROLLBACK` (HIGH severity), `RELEASE_DELETED`. Deployment events should include target environment, webhook used, and deployment status. This creates audit trail for compliance (SOC 2).

### Migration Risk

**Risk Level:** 🟢 LOW

- **CSRF Guard Addition:** Standard frontend coordination. Particularly important to test deployment and rollback flows.
- **Attachment Security:** May reject previously-accepted file types. Audit existing release attachments.
- **Webhook Validation:** Will reject non-approved webhook domains. Document approved domains and provide migration path for existing webhooks on custom domains.
- **Pagination:** Breaking API change for clients expecting full array. Version endpoint or document breaking change.

---

## Module: Backlog

> **Score:** 7.0/10 ⚠️ | **Priority:** 🔴 CRITICAL (SQL INJECTION)  
> **Standard:** OWASP SQL Injection Prevention / LexoRank Ordering / Parameterized Query Best Practices

### Current State Summary

The Backlog module is **compact and well-optimized** with excellent LexoRank implementation for O(1) single-item reordering, bulk CASE updates, and proper query builder usage in `getBacklog()`. However, it contains a **CRITICAL SQL INJECTION vulnerability** in `reorderItems()` where user-supplied issue IDs are directly interpolated into raw SQL via string concatenation (`WHEN '${id}' THEN ${idx}`). Additionally, **CSRF protection is missing** (0/10), **reorder DTO lacks UUID validation** (only `@IsString`), and the **permission check is empty** (no throw statement).

### Industry Standard Target

**How Jira/Linear/Notion Engineers Build Backlog Ordering Systems Today:**

1. **Parameterized Queries for ALL User Input (OWASP #1):** ALL user input MUST use parameterized queries, even for bulk operations. Never use string interpolation for SQL. PostgreSQL's VALUES clause with typed parameters is the safe pattern for bulk updates. The current string interpolation pattern is a textbook SQL injection vulnerability.

2. **UUID Validation at DTO Layer (Input Validation):** All entity IDs MUST be validated as UUIDs before reaching the service layer. The reorder DTO accepts `@IsString({ each: true })` which allows any string including SQL injection payloads. Defense in depth requires validation before parameterization.

3. **Universal CSRF Protection (OWASP Requirement):** All backlog mutations (move, reorder) must be CSRF-protected. Backlog manipulation via CSRF can disrupt sprint planning and project workflows.

4. **Effective Permission Enforcement (Authorization):** Permission checks MUST actually enforce. An empty if-block with no throw statement does nothing. Either throw `ForbiddenException` or remove the misleading check.

5. **LexoRank for Scalability (Performance):** The existing LexoRank implementation is industry-standard for O(1) reordering—Linear and Notion use similar approaches. Maintain this but consider periodic rebalancing for long-term key space management.

### The Fix Strategy

**Phase 1 - Fix SQL Injection (Week 1 - P0 CRITICAL):**  
Refactor `reorderItems()` to use fully parameterized VALUES clause. Build an array of parameters with alternating UUID and position values. Use PostgreSQL's VALUES clause with UPDATE FROM pattern: `UPDATE issues SET backlogOrder = v.new_order FROM (VALUES ($1::uuid, $2::int), ...) AS v(issue_id, new_order) WHERE issues.id = v.issue_id`. Never interpolate user input directly into SQL.

**Phase 2 - CSRF Protection (Week 1):**  
Add `CsrfGuard` to `BacklogController` at the class level. This protects both `move()` and `reorder()` endpoints. Backlog ordering is critical for sprint planning—CSRF attacks could disrupt team workflows.

**Phase 3 - UUID Validation in Reorder DTO (Week 1):**  
Replace `@IsString({ each: true })` with `@IsUUID('4', { each: true })` in `ReorderBacklogItemsDto`. This ensures only valid UUIDs reach the service layer, providing defense-in-depth even with parameterized queries. Also add `@ArrayMaxSize(100)` to prevent DoS via massive arrays.

**Phase 4 - Fix Empty Permission Check (Week 1):**  
The current permission check has an empty if-block that does nothing:
```
if (role !== PROJECT_LEAD && role !== MEMBER) { /* nothing! */ }
```
Either add `throw new ForbiddenException('Not authorized')` inside the block, or if the intent is to allow all authenticated members, replace with a simple membership check that throws if role is null.

**Phase 5 - Pagination (Week 2):**  
Refactor `getBacklog()` to use `findAndCount()` with `skip` and `take`. Add pagination query params to controller. Return paginated response. Large backlogs (1000+ items) will cause performance issues without pagination.

**Phase 6 - Backlog Caching with Smart Invalidation (Week 2):**  
Add Redis caching for `getBacklog()` results with 1-minute TTL. Invalidate on `move()` and `reorder()` operations. Consider optimistic updates for real-time backlog views.

### Migration Risk

**Risk Level:** 🟢 LOW

- **SQL Injection Fix:** Purely defensive change. Query results will be identical if inputs are valid UUIDs. If previously allowing invalid inputs (unlikely), queries will now fail validation instead of executing (correct behavior).
- **CSRF Guard:** Standard frontend coordination required.
- **UUID Validation:** May reject previously-accepted malformed IDs in reorder requests. This is correct—surfaces input validation bugs.
- **Permission Fix:** May cause 403 errors for requests that previously succeeded due to the empty check. Audit call patterns.
- **Pagination:** Breaking API change for clients expecting full array.

---

## Module: Custom-Fields

> **Score:** 3.5/10 🔴 | **Priority:** 🔴 CRITICAL (COMPLETE AUTHORIZATION BYPASS)  
> **Standard:** OWASP Authorization Failures / NIST AC-3 Access Control / Least Privilege Principle

### Current State Summary

The Custom-Fields module is **CRITICALLY INSECURE** with a **complete authorization bypass**. It has only `JwtAuthGuard`—no `PermissionsGuard`, no `@RequirePermission` decorators, no project membership validation, and no role checks. **Any authenticated user can create, modify, or delete custom field definitions for ANY project**, including projects belonging to other organizations. This represents cross-tenant data modification and schema corruption capability. The DTO validation is decent but irrelevant when authorization is completely absent.

### Industry Standard Target

**How Salesforce/Airtable/Monday.com Engineers Build Custom Field Systems Today:**

1. **Full Authorization Stack (Access Control Foundations):** Custom field schema modification is a highly privileged operation. Salesforce requires System Administrator profile. At minimum: JWT authentication → Permission validation → Project membership check → Role authorization (PROJECT_LEAD only for schema changes). The current single-guard approach is dangerous.

2. **Tenant Isolation for Schema Data (Multi-Tenancy):** Custom field definitions MUST be scoped to tenant/organization. Cross-tenant access to schema is a critical vulnerability. Airtable enforces workspace isolation on all base schema operations.

3. **Role-Based Access for Schema vs Values (Separation of Concerns):** Distinguish between modifying field definitions (schema) vs modifying field values on issues. Schema changes should require PROJECT_LEAD; value updates can allow any project member. Current module treats both the same (no restrictions).

4. **DTO Validation for Nested Structures (Input Validation):** The issue values update endpoint accepts raw `{ fieldId, value }[]` array with no validation. Use properly typed DTOs with `@ValidateNested` for arrays. Validate fieldId as UUID and value against field type constraints.

5. **Bulk Query Optimization (N+1 Prevention):** Custom field value updates should use bulk fetch with `In()` operator followed by single save, not loop-based individual queries.

### The Fix Strategy

**Phase 1 - Complete Authorization Stack (Week 1 - P0 BEFORE ANY DEPLOYMENT):**  
Add full authorization to `CustomFieldsController`: (a) Add `PermissionsGuard` to class-level `@UseGuards`. (b) Add `@RequirePermission('custom-fields:create')`, `@RequirePermission('custom-fields:update')`, `@RequirePermission('custom-fields:delete')` to respective endpoints. (c) Add `CsrfGuard` for CSRF protection. The current state allows any authenticated user from any organization to corrupt any project's schema.

**Phase 2 - Project Membership Validation (Week 1 - P0):**  
Inject `ProjectMembersService` into `CustomFieldsService`. For all operations, validate that the requesting user is a member of the target project. For schema changes (create/update/delete definition), require PROJECT_LEAD role. For value updates, allow any MEMBER. Throw `ForbiddenException` for unauthorized access.

**Phase 3 - Tenant Isolation (Week 1):**  
Use `TenantRepository` pattern for custom field queries. Ensure all queries include organization filter. Prevent cross-tenant field definition access. Add organizationId to CustomFieldDefinition entity if not present.

**Phase 4 - Issue Values DTO Validation (Week 1):**  
Create `UpdateFieldValueDto` with `@IsUUID('4')` for fieldId and `@IsString() @MaxLength(10000)` for value. Create `UpdateIssueFieldValuesDto` with `@IsArray() @ValidateNested({ each: true }) @Type(() => UpdateFieldValueDto)`. Add `ParseUUIDPipe` to issueId parameter. This prevents injection and ensures type safety.

**Phase 5 - Bulk Query Optimization (Week 2):**  
Refactor `updateValuesForIssue()` to: (a) Bulk fetch all existing values with `In()` operator. (b) Build update map. (c) Prepare all entities. (d) Single `save()` call with array. This reduces 2N queries to 2 queries regardless of field count.

**Phase 6 - Audit Logging (Week 2):**  
Add `AuditLogsService.log()` for: `CUSTOM_FIELD_CREATED` (HIGH severity—schema change), `CUSTOM_FIELD_UPDATED` (MEDIUM), `CUSTOM_FIELD_DELETED` (HIGH), `CUSTOM_FIELD_VALUES_UPDATED` (LOW). Schema changes are sensitive and require audit trail.

### Migration Risk

**Risk Level:** 🟡 MEDIUM

- **Authorization Addition:** Will cause 403 Forbidden errors for previously-successful requests from unauthorized users. This is **correct behavior**—the current state is a security vulnerability being fixed.
- **CSRF Guard:** Standard frontend coordination required.
- **DTO Validation:** May reject previously-accepted malformed value updates. Audit existing usage patterns.
- **Permission Registration:** Ensure `custom-fields:create`, `custom-fields:update`, `custom-fields:delete`, `custom-fields:view` permissions exist in the RBAC system for all roles that need access.

---

## Module: Workflows

> **Score:** 6.5/10 🔴 | **Priority:** 🔴 CRITICAL (REMOTE CODE EXECUTION)  
> **Standard:** OWASP Code Injection Prevention / Safe Expression Evaluation / Workflow Engine Security

### Current State Summary

The Workflows module is **feature-rich** with a comprehensive workflow engine (nodes, execution tracking, automation rules, analytics, templates), proper `PermissionsGuard`, `@RequirePermission` decorators, creator ownership checks, pagination, and execution statistics. However, it contains a **CRITICAL Remote Code Execution (RCE) vulnerability** via `new Function()` for condition evaluation—user-controlled workflow conditions can execute arbitrary Node.js code on the server. Additionally, no CSRF protection, no DTO validation on request bodies (raw `any` types), and missing tenant isolation.

### Industry Standard Target

**How Zapier/n8n/Temporal Engineers Build Workflow Engines Today:**

1. **Safe Expression Evaluation (RCE Prevention):** NEVER use `eval()`, `new Function()`, or `vm.runInContext()` with user input. Zapier uses structured JSON with predefined operations. Use declarative DSLs like JSON Logic, JEXL (JavaScript Expression Language for safe eval), or `expr-eval` which provide mathematical/logical expressions without code execution capability.

2. **Sandboxed Execution (Defense in Depth):** Even with safe expression evaluation, workflow action execution should run in sandboxed environments: isolated Docker containers, AWS Lambda, or VM2 with strict sandboxing. This limits blast radius if any escape occurs.

3. **DTO Validation for Complex Structures (Input Validation):** Workflow definitions are complex nested structures. MUST use proper DTOs with `@ValidateNested()` and `@Type()` decorators for nodes, connections, trigger configs, conditions, and actions. Current `any` types allow arbitrary payloads.

4. **Execution Rate Limiting (DoS Prevention):** Workflow executions should be rate-limited per user/project to prevent resource exhaustion. Temporal enforces execution quotas. Without limits, attackers can DoS the system via expensive workflow loops.

5. **Tenant Isolation for Automation Rules (Multi-Tenancy):** Automation rules should be scoped to organization. Verify organization membership before allowing rule creation or execution.

### The Fix Strategy

**Phase 1 - Replace new Function() with JSON Logic (Week 1 - P0 BEFORE ANY DEPLOYMENT):**  
Replace the `evaluateCondition()` method in `WorkflowEngineService` to use `json-logic-js` library instead of `new Function()`. JSON Logic provides a safe, declarative way to express conditions: `{"==": [{"var": "context.status"}, "completed"]}`. No arbitrary code execution possible. Migrate existing workflow conditions to JSON Logic format. If conditions are simple string comparisons, use a whitelist-based expression parser that only allows comparison operators and property access.

**Phase 2 - CSRF Protection for All Controllers (Week 1):**  
Add `CsrfGuard` to all workflow-related controllers: `WorkflowsController`, `AutomationRulesController`, `WorkflowTemplatesController`, etc. Workflow execution via CSRF is particularly dangerous given the RCE history.

**Phase 3 - Comprehensive DTO Validation (Week 1-2):**  
Create typed DTOs for all endpoints: `CreateWorkflowDto`, `WorkflowDefinitionDto`, `WorkflowNodeDto`, `CreateAutomationRuleDto`, `TriggerConfigDto`, `ConditionDto`, `ActionDto`. Use nested validation with `@ValidateNested({ each: true })` and `@Type()` for arrays. Replace all `any` typed parameters with properly validated DTOs.

**Phase 4 - Tenant Isolation (Week 2):**  
Inject organization context into workflow queries. Validate that the user belongs to the same organization as the project when creating/executing workflows. Prevent cross-tenant workflow access via automation rules.

**Phase 5 - Execution Rate Limiting (Week 2):**  
Add `@Throttle()` decorator to execution endpoints. Limit to reasonable execution rate per user (e.g., 100/hour) and per project (e.g., 1000/hour). Log excessive execution attempts as potential abuse.

**Phase 6 - Sandboxed Execution (Week 3-4 - Future Enhancement):**  
For maximum security, consider executing workflow actions in sandboxed environments. Options: Docker containers with resource limits, AWS Lambda functions, or VM2 with strict sandboxing. This is defense-in-depth after Phase 1 eliminates direct RCE.

### Migration Risk

**Risk Level:** 🟡 MEDIUM

- **JSON Logic Migration:** Existing workflow conditions in JavaScript expression format will break. Requires migration script to convert existing conditions to JSON Logic format. May need to pause workflow creation during migration.
- **DTO Validation:** Will reject previously-accepted malformed workflow definitions. Audit existing workflows for schema compliance.
- **CSRF Guard:** Standard frontend coordination required.
- **Rate Limiting:** Heavy workflow automation may hit limits. Document limits and provide override mechanism for enterprise customers.

---

## Module: Taxonomy

> **Score:** 8.5/10 ✅ | **Priority:** 🟡 MEDIUM  
> **Standard:** Categorization Patterns / Label Management / Many-to-Many Relationship Best Practices

### Current State Summary

The Taxonomy module is **one of the better-secured modules** with proper `PermissionsGuard`, `@RequirePermission` on all endpoints, PROJECT_LEAD role enforcement for CRUD operations, membership validation via `membersService.getUserRole()`, and proper DTO validation with UUID decorators. It manages labels and components with clean junction table design (IssueLabel, IssueComponent) and cascade deletes. The only security gap is **missing CSRF protection** (consistent with other modules), plus minor gaps in **name field MaxLength validation** and **pagination**.

### Industry Standard Target

**How GitHub/GitLab/Jira Engineers Build Label/Tag Systems Today:**

1. **Universal CSRF Protection (OWASP Requirement):** Label creation and deletion mutations should be CSRF-protected. While lower-impact than data manipulation, label pollution or deletion can disrupt project organization.

2. **Input Length Limits (DoS Prevention):** Label and component names should have maximum length constraints (typically 100 characters). Extremely long names cause UI rendering issues and minor database bloat.

3. **Pagination for Large Projects (Scalability):** Projects with extensive categorization (100+ labels, 50+ components) should return paginated results. GitHub paginates label lists at 100 per page.

4. **Search/Filter Capability (UX):** Label lists should support name filtering for quick lookup in projects with many labels.

5. **Audit Logging for Schema Changes (Compliance):** Label creation/deletion affects project organization and should be logged for audit trail.

### The Fix Strategy

**Phase 1 - CSRF Protection (Week 1):**  
Add `CsrfGuard` to `TaxonomyController` at the class level. This protects label and component CRUD endpoints as well as assignment operations. Consistent with the module-wide CSRF remediation pattern.

**Phase 2 - MaxLength Validation (Week 1):**  
Add `@MaxLength(100)` decorator to `name` fields in `CreateLabelDto`, `UpdateLabelDto`, `CreateComponentDto`, and `UpdateComponentDto`. This prevents excessively long names that could cause UI issues.

**Phase 3 - Pagination for List Endpoints (Week 2):**  
Refactor `listLabels()` and `listComponents()` to use `findAndCount()` with `skip` and `take` parameters. Add `page` and `limit` query params to controller GET endpoints. Default to 100 items per page (labels are typically small). Return total count for frontend pagination UI.

**Phase 4 - Search Filter (Week 2):**  
Add optional `search` query parameter to list endpoints. Use `ILIKE` for case-insensitive name matching: `WHERE name ILIKE :search`. This enables quick lookup in projects with many labels.

**Phase 5 - Audit Logging (Week 2 - Optional):**  
Add `AuditLogsService.log()` for `LABEL_CREATED`, `LABEL_DELETED`, `COMPONENT_CREATED`, `COMPONENT_DELETED`. Low severity but useful for compliance.

### Migration Risk

**Risk Level:** 🟢 LOW

- **CSRF Guard:** Standard frontend coordination required.
- **MaxLength:** May reject previously-accepted overly long names on update. Audit existing data—unlikely to have 100+ character names.
- **Pagination:** Breaking API change for clients expecting full array, but label list sizes are typically manageable.
- **Search:** Purely additive feature—no breaking changes.

---

## Module: Notifications

> **Score:** 7.8/10 | **Priority:** 🔴 CRITICAL (WEBSOCKET AUTHENTICATION BYPASS)  
> **Standard:** Fan-Out Pattern / Push Notification Security / WebSocket Authentication Best Practices

### Current State Summary

The Notifications module is **feature-rich** with enterprise-grade capabilities: Smart Digest batching (15-minute debounce), Inbox Zero features (snooze, archive, status management), BullMQ queue-backed delivery, Redis adapter for horizontal scaling, event-driven architecture via `@OnEvent`, optimized JSONB queries, and 3 composite indexes. However, it contains a **CRITICAL WebSocket authentication bypass**—the `authenticate` event trusts client-provided `userId` without JWT verification, allowing any user to connect as any other user and intercept all their notifications. Additionally, **CSRF protection is missing** on state-changing endpoints, and **pagination is missing**.

### Industry Standard Target

**How Slack/Discord/Firebase Push Engineers Build Notification Systems Today:**

1. **JWT-Based WebSocket Authentication (Security Baseline):** WebSocket connections MUST verify JWT tokens, NOT trust client-provided user IDs. Slack requires token-based authentication on every WebSocket connection. The current pattern allows complete notification interception—attacker simply provides victim's userId.

2. **Universal CSRF Protection (OWASP Requirement):** State-changing endpoints (archive, snooze, mark-as-read) should be CSRF-protected. Archive-all via CSRF can cause denial of service for notification access.

3. **DTO Validation for All Parameters (Input Validation):** Use `@IsUUID()` via `ParseUUIDPipe` for ID parameters and `@IsEnum()` DTOs for status updates. Invalid inputs should fail at validation layer, not database layer.

4. **Cursor-Based Pagination (Scalability):** Users with thousands of notifications need efficient pagination. Cursor-based (keyset) pagination is more efficient than offset for real-time data. Return `nextCursor` for infinite scroll.

5. **Delivery Confirmation (Reliability):** Track whether WebSocket notifications were actually delivered. Queue undelivered for later retry or push notification fallback.

### The Fix Strategy

**Phase 1 - WebSocket JWT Authentication (Week 1 - P0 CRITICAL):**  
Modify `NotificationsGateway.handleConnection()` to require JWT token in the `authenticate` event instead of trusting userId. Inject `JwtService` and call `jwtService.verifyAsync(token)` to extract userId from verified token. Disconnect socket immediately on verification failure. This prevents notification interception attacks.

**Phase 2 - CSRF Protection (Week 1):**  
Add `CsrfGuard` to `NotificationsController` at the class level. This protects `archiveAll()`, `snooze()`, `archive()`, `updateStatus()`, and other state-changing endpoints. Coordinate with frontend to include CSRF token in notification management requests.

**Phase 3 - DTO Validation (Week 1):**  
Create `UpdateNotificationStatusDto` with `@IsEnum(NotificationStatus)`. Add `ParseUUIDPipe` to all ID parameters in controller. This ensures invalid UUIDs and status values fail at validation layer with proper error messages.

**Phase 4 - Cursor-Based Pagination (Week 2):**  
Refactor `listForUser()` to use cursor-based pagination with `createdAt` + `id` composite cursor. Accept optional `cursor` and `limit` parameters. Return `{ data, nextCursor, hasMore }`. Default limit to 50. This enables efficient infinite scroll for heavy users.

**Phase 5 - Delivery Confirmation (Week 2):**  
Add Socket.IO acknowledgment callback to `sendToUser()`. Track delivery status in notification entity or separate delivery tracking table. Queue undelivered notifications for push notification fallback or later WebSocket retry.

**Phase 6 - Tenant Context (Week 2):**  
Add optional `organizationId` filtering to notification queries for multi-tenant deployments. This enables organization-scoped notification views.

### Migration Risk

**Risk Level:** 🟡 MEDIUM

- **WebSocket JWT Auth:** Will disconnect all existing WebSocket connections. Frontend must be updated to send JWT token in authenticate event. Coordinate deployment with frontend release.
- **CSRF Guard:** Standard frontend coordination required.
- **DTO Validation:** May reject previously-accepted invalid parameters—correct behavior.
- **Pagination:** Breaking API change for clients expecting full array. Frontend must implement infinite scroll or pagination UI.

---

## Module: Email

> **Score:** 4.5/10 ⚠️ | **Priority:** 🔴 CRITICAL (HTML TEMPLATE INJECTION)  
> **Standard:** OWASP XSS Prevention / Email Security Best Practices / Queue-Based Delivery Patterns

### Current State Summary

The Email module is **minimally implemented** with only a single method for invitation emails via Resend API. It contains a **CRITICAL HTML template injection vulnerability**—user-provided content (organization name, inviter name) is directly interpolated into HTML without sanitization, enabling XSS/phishing attacks. Additionally, there is **no rate limiting** (email bombing possible), **synchronous sending** (blocks requests), **no email validation**, **hardcoded templates**, and **no retry logic**. One of the lower-scoring modules requiring significant development.

### Industry Standard Target

**How SendGrid/Mailgun/AWS SES Engineers Build Email Systems Today:**

1. **HTML Input Sanitization (XSS Prevention):** ALL user-provided content interpolated into HTML MUST be escaped using `escape-html` or equivalent. Organization names, inviter names, and URLs can contain malicious HTML/JavaScript that executes in email clients or creates convincing phishing content.

2. **Rate Limiting per Recipient (Abuse Prevention):** Email sending MUST be rate-limited per recipient address (e.g., 10 emails/hour to same address). Without limits, attackers can flood victim inboxes ("email bombing") and get your domain blacklisted.

3. **Queue-Based Async Delivery (Reliability):** Email sending should use BullMQ with retry logic. Current synchronous `await resend.send()` blocks request, fails silently, and provides no retry. Queue enables exponential backoff, dead letter handling, and delivery tracking.

4. **Template Engine (Maintainability):** Use Handlebars, Pug, or MJML for email templates. Hardcoded HTML strings are unmaintainable and error-prone. Template engines provide automatic escaping and layout inheritance.

5. **Email Validation (Data Quality):** Validate email format before sending. Invalid emails waste API quota and harm sender reputation.

### The Fix Strategy

**Phase 1 - HTML Input Sanitization (Week 1 - P0 CRITICAL):**  
Install `escape-html` library. Before interpolating any user-provided content into HTML (orgName, inviterName), pass through `escapeHtml()` function. This prevents XSS and phishing via malicious organization names like `<script>...</script>` or fake content injection.

**Phase 2 - Rate Limiting (Week 1 - CRITICAL):**  
Implement per-recipient rate limiting: max 10 emails per hour to the same address. Use Redis to track `email:{address}` with TTL. Throw `TooManyRequestsException` when limit exceeded. This prevents email bombing and protects sender reputation.

**Phase 3 - Queue-Based Delivery (Week 1):**  
Integrate BullMQ for email delivery. Create `EmailProcessor` worker that processes `send-invitation` jobs. Configure 3 retry attempts with exponential backoff (1s, 2s, 4s). Set `removeOnFail: false` to preserve failed emails for analysis. This makes email delivery reliable and non-blocking.

**Phase 4 - Email Validation (Week 1):**  
Install `email-validator` library. Validate email format before queueing. Reject malformed emails early with `BadRequestException`. This improves data quality and prevents wasted API calls.

**Phase 5 - Template Engine (Week 2):**  
Migrate to Handlebars templates stored in `templates/` directory. Create `invitation.hbs` with auto-escaping enabled. This separates HTML from logic and provides built-in XSS protection.

**Phase 6 - Expand Email Types (Week 2+):**  
Add support for additional email types: password reset, account verification, notification digest, team alerts. Create corresponding templates and queue job types.

### Migration Risk

**Risk Level:** 🟢 LOW

- **HTML Sanitization:** May escape HTML that was previously rendered (if any org names contained legitimate HTML). This is correct—user content should never contain executable HTML.
- **Rate Limiting:** May block legitimate re-sends. Provide admin override mechanism.
- **Queue-Based Delivery:** Changes timing from synchronous to async. Frontend should not rely on email being sent before API response returns.
- **Template Migration:** Purely internal change—email appearance may vary slightly.

---

## Module: Webhooks

> **Score:** 7.5/10 ✅ | **Priority:** 🔴 HIGH  
> **Standard:** HMAC Signature Verification / Outbound Webhook Security / Reliable Delivery Patterns

### Current State Summary

The Webhooks module is **well-designed** with proper HMAC SHA-256 signature generation, exponential backoff retry (3 attempts), comprehensive delivery logging, automatic webhook disabling after 10 consecutive failures, 5-second timeout handling, and event-driven architecture. However, it is **missing PermissionsGuard** (only JWT—any authenticated user can create webhooks on any project enabling data exfiltration), **no CSRF protection**, **secrets stored in plain text**, **no TLS certificate verification** on webhook URLs (MITM risk), and **setTimeout for retries** (lost on server restart).

### Industry Standard Target

**How GitHub/Stripe/Twilio Engineers Build Webhook Systems Today:**

1. **Full Authorization Stack (Access Control):** Webhook management MUST require project membership AND specific permissions. GitHub requires repository admin access. Current module allows any authenticated user to create webhooks on any project—enabling data exfiltration to attacker-controlled servers.

2. **Secret Encryption at Rest (Data Protection):** Webhook secrets used for HMAC signing should be encrypted in the database using application-level encryption. Database breach exposure of secrets allows signature forgery.

3. **TLS Certificate Verification (Transport Security):** Webhook deliveries to HTTPS URLs should verify TLS certificates. Disable insecure/self-signed certs to prevent MITM attacks. Stripe enforces TLS 1.2+ with valid certificates.

4. **Queue-Based Reliable Delivery (Reliability):** Use BullMQ instead of `setTimeout` for retries. Current implementation loses pending retries on server restart. Queue provides persistence, visibility, and dead letter handling.

5. **Event Type Enum Validation (Input Validation):** Webhook event subscriptions should validate against enumerated allowed events. Current `@IsString({ each: true })` accepts any string.

### The Fix Strategy

**Phase 1 - Add PermissionsGuard and Membership Validation (Week 1 - HIGH):**  
Add `PermissionsGuard` to `WebhooksController` with `@RequirePermission('webhooks:create')`, `@RequirePermission('webhooks:delete')`, etc. In service methods, validate project membership using `membersService.getUserRole()`. Require PROJECT_LEAD role for webhook management. This prevents unauthorized webhook creation.

**Phase 2 - CSRF Protection (Week 1):**  
Add `CsrfGuard` to controller. Protects create, update, delete, and test endpoints. Coordinate with frontend.

**Phase 3 - Encrypt Secrets at Rest (Week 1):**  
Use the existing `EncryptedColumn` decorator (or `EncryptionService`) for the `secret` field in Webhook entity. Secrets are decrypted only when generating HMAC signatures. Database breach no longer exposes signing keys.

**Phase 4 - TLS Certificate Verification (Week 1):**  
Create HTTPS agent with `rejectUnauthorized: true` and `minVersion: 'TLSv1.2'`. Use this agent for all webhook deliveries to HTTPS URLs. Reject self-signed or expired certificates.

**Phase 5 - BullMQ for Reliable Retry (Week 2):**  
Replace `setTimeout` retry with BullMQ queue. Create `WebhookDeliveryProcessor` that processes webhook delivery jobs. Configure 3 attempts with exponential backoff. Set `removeOnFail: false` for dead letter analysis. This survives server restarts.

**Phase 6 - Event Enum Validation (Week 2):**  
Define `WebhookEventType` enum with allowed events (issue.created, issue.updated, sprint.completed, etc.). Use `@IsEnum(WebhookEventType, { each: true })` in DTO. Reject invalid event subscriptions.

### Migration Risk

**Risk Level:** 🟡 MEDIUM

- **PermissionsGuard:** Will cause 403 errors for previously-successful unauthorized requests. This is correct—surfaces authorization bypass bug.
- **Secret Encryption:** Requires migration to encrypt existing secrets. One-time migration script needed.
- **TLS Verification:** Will fail delivery to webhooks with invalid certs. Audit existing webhook URLs.
- **BullMQ Migration:** In-flight `setTimeout` retries will be lost on deployment. Accept one-time delivery gap or drain before deploy.

---

## Module: Gateways

> **Score:** 5.5/10 ⚠️ | **Priority:** 🔴 CRITICAL (UNAUTHENTICATED WEBSOCKET)  
> **Standard:** WebSocket Security / Real-Time Authentication / Room-Based Access Control

### Current State Summary

The Gateways module contains **TWO DUPLICATE WebSocket gateway implementations with INCONSISTENT SECURITY**: `gateways/board.gateway.ts` has proper `WsJwtGuard` with JWT verification ✅, while `boards/boards.gateway.ts` has **NO AUTHENTICATION AT ALL** 🔴—any anonymous client can connect and join any board room, receiving all real-time updates. Both gateways use **CORS wildcard `origin: '*'`** which enables cross-site WebSocket hijacking. Additionally, even the secured gateway lacks **room access permission validation**—any authenticated user can join any board regardless of project membership.

### Industry Standard Target

**How Figma/Miro/Notion Engineers Build Real-Time Collaboration Systems Today:**

1. **Single Unified Gateway (Architecture):** There should be ONE gateway implementation per namespace, not duplicates with inconsistent security. Current duplication creates confusion and security bypasses.

2. **JWT Authentication on All WebSocket Connections (Security Baseline):** ALL WebSocket gateways MUST authenticate via JWT. Current `boards.gateway.ts` allows completely anonymous connections—a severe data breach vulnerability enabling real-time exfiltration of all board activities.

3. **Room Access Permission Validation (Authorization):** Before allowing a client to join a room, verify they have access to the underlying resource. Check project membership and board view permissions. Current implementation allows any authenticated user to join any board room.

4. **Production CORS Configuration (Transport Security):** Use environment-configured allowed origins, not wildcard `*`. Cross-site WebSocket hijacking allows malicious sites to connect to your WebSocket server.

5. **Token Refresh Handling (Session Management):** Long-running WebSocket connections should support token refresh to avoid disconnection when JWT expires.

### The Fix Strategy

**Phase 1 - Remove or Secure Duplicate Gateway (Week 1 - P0 CRITICAL):**  
Either delete `boards/boards.gateway.ts` entirely (recommended—use the secured `gateways/board.gateway.ts`) OR add `@UseGuards(WsJwtGuard)` to the unsecured gateway immediately. The current state allows complete anonymous real-time data exfiltration of all board activities.

**Phase 2 - Room Access Permission Validation (Week 1 - CRITICAL):**  
In the `handleJoinBoard()` method of the secured gateway, before joining the room: (a) Extract userId from verified socket token. (b) Call `boardsService.userHasAccess(userId, boardId)` or equivalent. (c) Reject with access denied error if user is not a project member. This prevents cross-tenant board spying.

**Phase 3 - Fix CORS Wildcards (Week 1):**  
Replace `origin: '*'` with environment-configured origins: `origin: process.env.FRONTEND_URLS?.split(',') || ['http://localhost:3000']`. Add `credentials: true` for cookie/token support. This prevents cross-site WebSocket hijacking.

**Phase 4 - Consolidate to Single Gateway (Week 2):**  
Remove the duplicate `boards/boards.gateway.ts` and ensure all board real-time functionality uses `gateways/board.gateway.ts`. Update any references in the codebase. This eliminates security inconsistency and maintenance burden.

**Phase 5 - Token Refresh Handling (Week 2 - Enhancement):**  
Add `refreshToken` event handler to accept new JWT during active connection. Verify new token and update `client.data.user`. Emit success/failure acknowledgment. This supports long-running connections without forced disconnect on token expiry.

**Phase 6 - Connection State Recovery (Week 2 - Enhancement):**  
Store room subscriptions in Redis with socket ID mapping. On reconnection, auto-rejoin previous rooms after re-authentication. This improves UX on page refresh or temporary disconnects.

### Migration Risk

**Risk Level:** 🟢 LOW

- **Gateway Removal:** Will disconnect any clients using the unsecured `/boards` namespace. They should reconnect to the secured namespace. This is correct—existing connections were insecure.
- **Room Permission Check:** May deny access to users who were previously able to join any room. This surfaces authorization bugs.
- **CORS Fix:** May prevent connections from development environments if not properly configured. Test in staging first.

---

## Module: AI

> **Score:** 8.7/10 ✅ | **Priority:** 🟡 MEDIUM  
> **Standard:** AI Integration Patterns / Circuit Breaker / Multi-Provider Failover / Rate Limiting

### Current State Summary

The AI module is **enterprise-grade** and one of the best-designed modules with multiple AI providers (Groq, OpenRouter, Gemini) with automatic failover, circuit breaker protection, BullMQ queue-backed async processing, prediction logging for shadow mode evaluation, confidence-based auto-apply thresholds (≥95% auto, 75-95% suggest), comprehensive health checking, and project role guards. However, it lacks **rate limiting on AI endpoints** (cost exploitation risk), **PII is sent to external APIs without sanitization** (GDPR/HIPAA compliance risk), and **CSRF protection is missing** on accept/reject endpoints.

### Industry Standard Target

**How OpenAI/Anthropic/Google AI Engineers Build AI Integration Systems Today:**

1. **Rate Limiting per User/Tenant (Cost Protection):** AI API calls cost money. Without rate limits, malicious users can exhaust quotas or run up bills. OpenAI enforces token-per-minute limits. Implement per-user throttling (e.g., 10 requests/minute) and per-organization daily/monthly quotas.

2. **PII Sanitization Before External API Calls (Compliance):** Issue content may contain user names, emails, phone numbers, or proprietary business data. Before sending to external AI providers, sanitize PII. GDPR requires explicit consent for third-party data processing. Healthcare (HIPAA) and financial data require additional protections.

3. **Cost Tracking per Tenant (Business Intelligence):** Track token usage and estimated cost per organization for billing, quotas, and capacity planning. This enables usage-based pricing models.

4. **AI Consent Management (Ethics):** Users/organizations should explicitly opt-in to AI features. Some may have policies prohibiting external AI processing of their data.

5. **CSRF Protection on State-Changing AI Endpoints (Security):** Accept/reject suggestion endpoints modify state and should be CSRF-protected.

### The Fix Strategy

**Phase 1 - Rate Limiting on AI Endpoints (Week 1):**  
Add `@Throttle()` decorator to AI controllers. Configure limits: 10 requests/minute for `/chat/ask`, 20 requests/minute for `/suggestions`. Use `ThrottlerGuard` at controller level. This prevents cost exploitation and API abuse.

**Phase 2 - PII Sanitization (Week 1 - COMPLIANCE CRITICAL):**  
Create `PIISanitizer` utility that uses regex patterns to detect and redact: email addresses, phone numbers, credit card patterns, SSN-like numbers, and configurable organization-specific patterns. Apply sanitization to `issue.title` and `issue.description` before sending to AI providers. Log sanitization events for compliance audit.

**Phase 3 - Cost Tracking per Tenant (Week 2):**  
Create `AICostTracker` service that records: tenantId, provider, token count, estimated cost, timestamp. Track per-organization usage with daily/monthly aggregations. Add alerts when approaching quota. Expose usage metrics endpoint for organization admins.

**Phase 4 - CSRF Protection (Week 1):**  
Add `CsrfGuard` to `SuggestionsController` to protect accept/reject endpoints. Standard frontend coordination required.

**Phase 5 - AI Consent Management (Week 2):**  
Add `AIConsentService` that checks organization AI settings before processing. Store consent flags in organization settings. Throw `ForbiddenException` if AI features not enabled. Provide consent management UI.

### Migration Risk

**Risk Level:** 🟢 LOW

- **Rate Limiting:** May throttle heavy users. Document limits and provide enterprise tier with higher quotas.
- **PII Sanitization:** May redact false positives. Implement allowlist for known safe patterns.
- **Cost Tracking:** Purely additive monitoring feature.
- **Consent Check:** May block AI for organizations without explicit consent. Provide migration path with default opt-in for existing orgs.

---

## Module: RAG

> **Score:** 6.8/10 ⚠️ | **Priority:** 🟡 MEDIUM-HIGH  
> **Standard:** LangChain / Enterprise RAG Patterns / Hybrid Search / Vector Database Best Practices

### Current State Summary

The RAG module has a **solid foundation** with pgvector integration, tenant isolation via TenantContext, document deduplication via SHA256, transactional ingestion, streaming responses, and confidence scoring. However, it is **NOT enterprise-grade**: conversation storage uses **in-memory Map** (data lost on restart, no horizontal scaling), chunking is **naive character-based** (splits mid-sentence), search is **vector-only** (no BM25 hybrid), **no reranking** after retrieval, **no HNSW index optimization**, **no response caching**, and **no rate limiting** on expensive AI endpoints.

### Industry Standard Target

**How Pinecone/Weaviate/LangChain Engineers Build Enterprise RAG Systems Today:**

1. **Redis-Based Conversation Storage (Statelessness):** Conversation history MUST be stored in Redis, not in-memory. In-memory storage loses data on restart, prevents horizontal scaling, and causes memory pressure. Use CacheService with 1-hour TTL.

2. **Semantic Chunking (Retrieval Quality):** Use LangChain's `RecursiveCharacterTextSplitter` with semantic separators (`\n\n`, `\n`, `. `, etc.) instead of fixed character windows. Current naive chunking splits mid-sentence, losing context at boundaries.

3. **Hybrid Search (BM25 + Vector):** Combine keyword search (pg_trgm/tsvector) with vector similarity for better retrieval. Pure vector search misses exact keyword matches. Weight: 60% semantic + 40% BM25.

4. **Reranking After Retrieval (Precision):** Use cross-encoder reranking (Cohere, BGE) to reorder initial retrieval results. Raw similarity scores are often noisy; reranking significantly improves precision.

5. **HNSW Index Optimization (Performance):** Explicitly configure HNSW index parameters (m=16, ef_construction=64) for cosine distance. Improves search performance at scale.

6. **Response Caching (Cost Reduction):** Cache frequently asked questions by query hash. Same question for same project should return cached response, not re-call LLM.

### The Fix Strategy

**Phase 1 - Redis Conversation Storage (Week 1 - CRITICAL):**  
Replace in-memory `Map<string, ConversationMessage[]>` with Redis via existing `CacheService`. Key format: `rag:conv:{conversationId}`. Set 1-hour TTL. This enables horizontal scaling and survives restarts.

**Phase 2 - Semantic Chunking (Week 1-2):**  
Install LangChain and use `RecursiveCharacterTextSplitter` with separators: `['\n\n', '\n', '. ', '! ', '? ', ' ', '']`. Configure chunk size 1000, overlap 200. This preserves semantic units at chunk boundaries.

**Phase 3 - Hybrid Search (Week 2):**  
Add tsvector column to issues/documents. Create GIN index. Modify retrieval query to combine: `0.6 * vector_similarity + 0.4 * ts_rank()`. This captures both semantic meaning and exact keyword matches.

**Phase 4 - Response Caching (Week 2):**  
Before calling LLM, hash the question + project context. Check Redis cache. On cache miss, generate answer and store with 1-hour TTL. This significantly reduces API costs for repeated questions.

**Phase 5 - HNSW Index Configuration (Week 2):**  
Create explicit HNSW index with optimal parameters: `CREATE INDEX ON issues USING hnsw (embedding_vector vector_cosine_ops) WITH (m=16, ef_construction=64)`. Ensure index is used in queries.

**Phase 6 - Reranking (Week 3):**  
After initial retrieval (top-20), use BGE reranker or Cohere rerank API to reorder to top-5. Cross-encoders provide more accurate relevance scoring than bi-encoder similarity.

**Phase 7 - Rate Limiting (Week 1):**  
Add `@Throttle()` decorator to RAG endpoints. Configure: 20 requests/minute for chat, 10 for indexing. Protect expensive embedding + LLM operations.

### Migration Risk

**Risk Level:** 🟡 MEDIUM

- **Redis Migration:** Existing in-memory conversations will be lost on next deploy. Accept one-time data loss or provide migration path.
- **Semantic Chunking:** Re-indexing required for existing documents to benefit from new chunking. Plan batch re-indexing.
- **Hybrid Search:** Requires adding tsvector column and index. One-time migration script.
- **HNSW Index:** Creating index on large table may take time. Plan during maintenance window.

---

## Module: Analytics

> **Score:** 7.8/10 ✅ | **Priority:** 🟡 MEDIUM  
> **Standard:** Metrics Engineering / Time-Series Analytics / Percentile Calculation Best Practices

### Current State Summary

The Analytics module has **solid algorithmic foundations** with proper percentile calculations (p50/p85/p95), multi-factor sprint risk scoring (scope creep, velocity deviation, time pressure), automated stall detection with notification integration, and cron-based risk calculations. However, it has a **tenant isolation gap** in `calculateAverageForPeriod`, an **N+1 query pattern** in cycle time calculation (100 issues = 100 revision queries), **no result caching** (recalculates on every request), and **no historical metrics storage** (cannot show time-series trends).

### Industry Standard Target

**How Datadog/New Relic/Jira Engineers Build Analytics Systems Today:**

1. **Consistent Tenant Isolation (Multi-Tenancy):** ALL queries MUST include tenant context. Current `calculateAverageForPeriod` and stalled issues cron are missing `tenantJoin()`. Cross-tenant data could leak.

2. **Batch Query Fetching (Performance):** Avoid N+1 patterns. Fetch revisions for all issues in a single batch query, then map in-memory. Current pattern: 100 issues = 100 revision queries.

3. **Result Caching (Performance):** Analytics calculations are expensive. Cache results with appropriate TTL (e.g., 5 minutes). Invalidate on data changes if needed.

4. **Historical Metrics Storage (Time-Series):** Store calculated metrics with timestamps for trend visualization. Current implementation recalculates live—cannot show "cycle time over the past 6 months."

5. **External Alerting Integration (Operations):** Integrate with Slack, PagerDuty for critical alerts. Current implementation only uses internal NotificationsService.

### The Fix Strategy

**Phase 1 - Fix Tenant Isolation Gaps (Week 1):**  
Add `tenantJoin()` to `calculateAverageForPeriod` in `cycle-time.service.ts`. In stalled issues cron, either scope by organization or add explicit tenant context. This prevents cross-tenant data leakage.

**Phase 2 - Fix N+1 Query Pattern (Week 1):**  
Create `RevisionsService.listBatch(entityType, entityIds[])` method that fetches all revisions for multiple entities in a single query using `WHERE entityId IN (...)`. In cycle time calculation, batch-fetch revisions for all issues, then create a Map for O(1) lookup.

**Phase 3 - Add Result Caching (Week 1):**  
Inject `CacheService` into analytics services. Cache `getCycleTime()` with key `analytics:cycletime:{projectId}:{days}` and 5-minute TTL. Cache `getSprintRisk()` and other expensive calculations similarly.

**Phase 4 - Historical Metrics Storage (Week 2):**  
Create `ProjectMetrics` entity with: projectId, metricType (cycle_time, velocity, risk_score), value, percentiles (JSON), calculatedAt. In cron jobs, persist calculated metrics. Create endpoint to query historical metrics for time-series visualization.

**Phase 5 - External Alerting (Week 2):**  
Create `AlertingService` with providers for Slack (webhook) and PagerDuty (events API). Integrate with sprint risk detection—when risk > 0.8, send alert to configured channels.

### Migration Risk

**Risk Level:** 🟢 LOW

- **Tenant Isolation Fix:** May filter out previously-visible cross-tenant data—this is correct behavior.
- **N+1 Fix:** Pure performance improvement, no functional change.
- **Caching:** May return slightly stale data. 5-minute TTL is acceptable for analytics.
- **Historical Storage:** Purely additive—new data accumulates going forward.

---

## Module: Reports

> **Score:** 8.8/10 ✅ | **Priority:** 🟢 LOW  
> **Standard:** Enterprise Reporting / Query Optimization / Caching Patterns

### Current State Summary

The Reports module is **one of the best-designed modules** and serves as a **reference implementation** for the codebase. It demonstrates excellent engineering: result caching with CacheService (5-minute TTL), single aggregation queries instead of N+1 patterns, parallel execution with `Promise.all()` for breakdown reports, O(1) Map lookups for data mapping, proper `@RequirePermission` decorators on all endpoints, and type-safe raw queries with explicit interfaces. Comprehensive report types: velocity, burndown, cumulative flow diagram, epic progress, and issue breakdown. Only gaps are **no PDF/Excel export**, **no scheduled reports**, and **no email distribution**.

### Industry Standard Target

**How Jira/Asana/Monday.com Engineers Build Enterprise Reporting Systems Today:**

1. **Result Caching (Performance):** ✅ ALREADY IMPLEMENTED. Reports cache results with appropriate TTL. This module does this correctly.

2. **Query Optimization (Performance):** ✅ ALREADY IMPLEMENTED. Single aggregation queries, parallel execution, O(1) lookups.

3. **Export Formats (Business Requirement):** Enterprise users need PDF/Excel exports for offline sharing, executive presentations, and archival. Currently JSON-only.

4. **Scheduled Reports (Automation):** Cron-based weekly/monthly summary reports sent to project leads. Currently manual-only access.

5. **Email Distribution (Communication):** Automatically email reports to configured stakeholders. Currently requires manual access.

### The Fix Strategy

**Phase 1 - PDF Export (Week 1 - Optional Enhancement):**  
Install `puppeteer` (for PDF generation from HTML) or `pdfkit` (for programmatic PDF). Create `PdfExportService` that generates charts and tables. Add `/reports/velocity/export?format=pdf` endpoint. This enables offline sharing and executive presentations.

**Phase 2 - Excel Export (Week 1 - Optional Enhancement):**  
Install `exceljs` library. Create `ExcelExportService` that generates XLSX with proper formatting, charts, and multiple sheets. Add `/reports/velocity/export?format=xlsx` endpoint. This enables data analysis in spreadsheet tools.

**Phase 3 - Scheduled Reports (Week 2 - Optional Enhancement):**  
Create `ScheduledReportsService` with `@Cron('0 8 * * 1')` for weekly Monday reports. Fetch all active projects, generate summary reports, store in S3/storage. Send download links via notification.

**Phase 4 - Email Distribution (Week 2 - Optional Enhancement):**  
Create `ReportDistributionService` that emails generated reports to configured recipients. Integrate with EmailService. Allow project leads to configure distribution lists and report types.

**Phase 5 - Defense-in-Depth Tenant Isolation (Week 1 - Low Priority):**  
Add `tenantJoin()` to report queries for explicit tenant isolation. Current implementation relies on permission guards—correct but adding tenant joins provides defense-in-depth.

### Migration Risk

**Risk Level:** 🟢 LOW (No Required Changes)

- **PDF/Excel Export:** Purely additive feature—new endpoints.
- **Scheduled Reports:** Purely additive feature—new cron job.
- **Email Distribution:** Purely additive feature—new service.
- **All changes are optional enhancements.** This module is production-ready as-is.

---

## Module: Health

> **Score:** 9.2/10 ✅ | **Priority:** 🟢 LOW  
> **Standard:** Kubernetes Probe Patterns / Terminus Health Checks / Observability Best Practices

### Current State Summary

The Health module is **enterprise-grade** with proper Kubernetes probe patterns: correctly separated liveness (`/health/live` - memory only, no external deps) and readiness (`/health/ready` - db+redis+memory), public probes for K8s via `@Public()` decorator, protected detailed health via `@SuperAdminGuard`, custom Redis health indicator with latency measurement, TypeOrmHealthIndicator for database, memory heap/RSS checks with thresholds, and disk space monitoring at 90%. Only minor gaps are **hardcoded thresholds** (should be configurable) and **no Prometheus metrics endpoint**.

### Industry Standard Target

**How Netflix/Kubernetes/Google SRE Engineers Build Health Check Systems Today:**

1. **Liveness vs Readiness Separation (K8s Requirement):** ✅ ALREADY IMPLEMENTED. Liveness should be fast with no external dependencies (only memory check). Readiness should check all critical dependencies.

2. **Public Probes, Protected Details (Security):** ✅ ALREADY IMPLEMENTED. K8s needs public access to probes, but detailed health should be protected.

3. **Configurable Thresholds (Operations):** Thresholds should be environment-configurable for different deployment sizes. Currently hardcoded (500MB heap, 1GB RSS, 90% disk).

4. **Prometheus Metrics (Observability):** Standard `/metrics` endpoint for Prometheus scraping. Enables Grafana dashboards, alerting, and historical tracking.

5. **Additional Dependency Checks (Completeness):** Add BullMQ queue health check for job processing health.

### The Fix Strategy

**Phase 1 - Configurable Thresholds (Week 1 - Optional):**  
Inject ConfigService and use environment variables for thresholds: `HEALTH_MEMORY_HEAP_MB`, `HEALTH_MEMORY_RSS_MB`, `HEALTH_DISK_PERCENT`. Default to current values if not set. This enables tuning for different deployment sizes.

**Phase 2 - Prometheus Metrics Endpoint (Week 1 - Optional):**  
Install `@willsoto/nestjs-prometheus` or `prom-client`. Create `/metrics` endpoint that exposes: application uptime, request counts, response latencies, memory usage, custom business metrics. Keep endpoint public or protect with bearer token.

**Phase 3 - BullMQ Health Check (Week 1 - Optional):**  
Create custom `BullMQHealthIndicator` that pings the queue connection. Add to readiness check. This ensures job processing infrastructure is healthy.

**Phase 4 - Health Check Timeout (Week 1 - Low Priority):**  
Make database timeout configurable. Currently 1500ms hardcoded. Different environments may need different timeouts.

### Migration Risk

**Risk Level:** 🟢 LOW (No Required Changes)

- **Configurable Thresholds:** Purely backwards-compatible—defaults to current values.
- **Prometheus Metrics:** Purely additive endpoint.
- **BullMQ Health:** Purely additive indicator.
- **This module is PRODUCTION-READY for Kubernetes deployment as-is.**

---

## Module: Audit

> **Score:** 9.3/10 ✅ | **Priority:** 🟢 LOW  
> **Standard:** Compliance Audit Logging / SOC 2 / HIPAA / GDPR / Event Sourcing Patterns

### Current State Summary

The Audit module is **enterprise-grade** and **compliance-ready** for SOC 2, HIPAA, and GDPR with: 25+ event types (auth, CRUD, security, file operations), automatic event capture via interceptor, granular permissions (`audit:read`, `audit:admin`, `audit:export`), severity classification (LOW/MEDIUM/HIGH/CRITICAL), event-based retention policies (90 days to 7 years), expiration dates per event type, archive/cleanup operations, CSV/JSON export with 10K limit, security events endpoint, ClickHouse integration for scale, and full request context (IP, User Agent, Session ID, Request ID). Minor gaps: **no explicit tenant isolation** in queries (relies on permission guards) and **in-memory stats aggregation** (should use database).

### Industry Standard Target

**How Splunk/Datadog/AWS CloudTrail Engineers Build Audit Systems Today:**

1. **Comprehensive Event Types (Compliance):** ✅ ALREADY IMPLEMENTED. 25+ event types covering auth, CRUD, security, and file operations.

2. **Retention Policies (Compliance):** ✅ ALREADY IMPLEMENTED. Event-based retention from 90 days to 7 years.

3. **Tenant Isolation (Multi-Tenancy):** Add explicit organization filter to audit queries. Current implementation relies on permission guards—works but adding tenant isolation provides defense-in-depth.

4. **Database-Level Aggregation (Performance):** Stats aggregation should use SQL GROUP BY, not in-memory processing. Fetching all logs then aggregating in JavaScript is inefficient at scale.

5. **Real-Time Security Alerting (Operations):** High-severity security events (brute force, unauthorized access) should trigger immediate alerts to Slack/PagerDuty.

### The Fix Strategy

**Phase 1 - Tenant Isolation (Week 1 - Optional):**  
Add `organizationId` filter to `getAuditLogs()`, `getAuditStats()`, and other query methods. Extract organizationId from authenticated user context. This provides defense-in-depth beyond permission guards.

**Phase 2 - Database-Level Aggregation (Week 1 - Optional):**  
Replace in-memory aggregation in `getAuditStats()` with SQL GROUP BY queries. Use `createQueryBuilder().select('eventType').addSelect('COUNT(*)', 'count').groupBy('eventType')`. This improves performance at scale.

**Phase 3 - Real-Time Security Alerting (Week 2 - Optional):**  
Create `SecurityAlertService` that integrates with Slack (webhook) and PagerDuty (events API). In `log()` method, check if severity >= HIGH and push alert. This enables immediate security response.

**Phase 4 - Streaming Export (Week 2 - Optional):**  
For large datasets, implement streaming JSON export using Node.js streams. Current 10K limit is appropriate for CSV, but JSON could stream larger datasets.

### Migration Risk

**Risk Level:** 🟢 LOW (No Required Changes)

- **Tenant Isolation:** May filter out cross-tenant data previously visible—this is correct behavior.
- **Database Aggregation:** Pure performance improvement.
- **Security Alerting:** Purely additive feature.
- **This module is COMPLIANCE-READY for SOC 2, HIPAA, and GDPR as-is.**

---

## Module: Telemetry

> **Score:** 5.5/10 ⚠️ | **Priority:** 🟡 MEDIUM  
> **Standard:** OpenTelemetry / Prometheus / Observability Patterns / Distributed Tracing

### Current State Summary

The Telemetry module is a **minimal prototype** focused on a single use case: tracking user activity on issues and auto-transitioning tickets to "In Progress" after 10 minutes. It uses BullMQ for async processing and Redis for session tracking with TTL, which are good patterns. However, it **uses `any` type** for input (no DTO validation), has **no rate limiting** on high-frequency heartbeat endpoint, **no Prometheus metrics export**, **no OpenTelemetry integration** for distributed tracing, has a **confusing TODO comment** ("Add API Key Guard" when guard is already applied), and **no metrics persistence**. NOT enterprise-grade.

### Industry Standard Target

**How Datadog/New Relic/Google SRE Engineers Build Telemetry Systems Today:**

1. **Input Validation (Security):** ALL endpoints MUST validate input with DTOs. Current `any` type allows arbitrary data injection and queue poisoning.

2. **Rate Limiting (Availability):** Heartbeat endpoints receive frequent calls—MUST be rate-limited to prevent DoS. Typical: 60 requests/minute per client.

3. **Prometheus Metrics Export (Observability):** Standard `/metrics` endpoint for Prometheus scraping. Export counters, histograms, gauges for: request latency, queue depth, active users, error rates.

4. **OpenTelemetry Integration (Tracing):** Distributed tracing via OpenTelemetry SDK. Trace requests across services for debugging and performance analysis.

5. **Metrics Persistence (Analytics):** Store aggregated telemetry for historical analysis. Use time-series database (InfluxDB, TimescaleDB) or ClickHouse.

### The Fix Strategy

**Phase 1 - DTO Validation (Week 1 - HIGH):**  
Create `HeartbeatDto` with `@IsUUID()` decorators for ticketId, projectId, userId. Replace `any` type with validated DTO. Add `ValidationPipe` to controller. This prevents queue poisoning and data corruption.

**Phase 2 - Rate Limiting (Week 1 - HIGH):**  
Add `@Throttle({ default: { limit: 60, ttl: 60000 } })` to heartbeat endpoint. This limits to 60 requests per minute per client, preventing DoS while allowing normal tracking.

**Phase 3 - Remove Confusing TODO (Week 1):**  
Remove the "TODO: Add API Key Guard" comment since `@UseGuards(ApiKeyGuard)` is already applied above. This reduces developer confusion.

**Phase 4 - Prometheus Metrics (Week 2):**  
Install `prom-client` or `@willsoto/nestjs-prometheus`. Create MetricsService that tracks: heartbeat counts (Counter), session durations (Histogram), active sessions (Gauge), queue depth (Gauge). Expose via `/metrics` endpoint.

**Phase 5 - OpenTelemetry Integration (Week 2):**  
Install `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`. Initialize OpenTelemetry SDK in main.ts. Configure exporter for Jaeger/Zipkin. This enables distributed tracing across services.

**Phase 6 - Metrics Persistence (Week 3):**  
Create telemetry aggregation table or integrate with time-series database. Store: daily active users, session counts, transition events. Create analytics endpoints for historical data.

### Migration Risk

**Risk Level:** 🟢 LOW

- **DTO Validation:** May reject previously-accepted malformed heartbeats—correct behavior.
- **Rate Limiting:** May throttle aggressive clients. Adjust limits as needed.
- **Prometheus/OpenTelemetry:** Purely additive observability features.
- **Metrics Persistence:** Purely additive analytics capability.

---

## Module: Scheduled-Tasks

> **Score:** 9.0/10 ✅ | **Priority:** 🟢 LOW  
> **Standard:** Data Lifecycle Management / Cascade Deletion / Transactional Safety / FK Constraint Handling

### Current State Summary

The Scheduled-Tasks module is **enterprise-grade** with comprehensive cascade deletion handling for 20+ related tables in correct foreign key order (15 deletion levels from deepest children to parent), full transactional safety with commit/rollback, configurable retention period (`PURGE_RETENTION_DAYS`), batch processing (`PURGE_BATCH_SIZE`), soft-delete verification before purge, manual trigger method, per-project error isolation, and detailed logging. Minor gaps: **no distributed locking** (concurrent runs possible in multi-instance) and **no admin API endpoint** for manual triggers.

### Industry Standard Target

**How Stripe/GitHub/MongoDB Engineers Build Data Lifecycle Systems Today:**

1. **Correct FK Constraint Order (Data Integrity):** ✅ ALREADY IMPLEMENTED. 15 deletion levels from deepest children to parent project. Textbook-correct RESTRICT constraint handling.

2. **Transactional Safety (Atomicity):** ✅ ALREADY IMPLEMENTED. Full transaction wrapping with rollback on error.

3. **Distributed Locking (Multi-Instance):** In multi-instance deployments, multiple cron instances could run simultaneously. Use Redis-based distributed lock to ensure only one instance executes purge.

4. **Admin API (Operations):** Expose manual purge functionality via protected admin endpoint. Enables on-demand cleanup without waiting for cron.

5. **Progress Notifications (Visibility):** Notify on purge completion (Slack/email) with counts. Important for operational visibility.

### The Fix Strategy

**Phase 1 - Distributed Locking (Week 1 - Optional):**  
Before executing purge, acquire Redis lock using `SET NX EX` (or Redlock for stricter consistency). Key: `project-purge-lock`. TTL: 1 hour. If lock not acquired, log and skip. Release lock in `finally` block. This prevents duplicate purge runs in multi-instance deployments.

**Phase 2 - Admin API Endpoint (Week 1 - Optional):**  
Create `PurgeController` with `@SuperAdminGuard` protection. Add `POST /admin/purge/project/:id` endpoint that calls `manualPurge()`. Add `GET /admin/purge/status` to check last purge results. This enables operational control.

**Phase 3 - Progress Notifications (Week 2 - Optional):**  
After purge completion, send notification to configured Slack channel or admin email. Include: project count, record counts per table, duration, any errors. This provides operational visibility.

**Phase 4 - Audit Logging (Week 2 - Optional):**  
Log purge events to audit system with: projectId, purgedBy (cron vs admin), record counts, timestamp. Important for compliance tracking of data deletion.

### Migration Risk

**Risk Level:** 🟢 LOW (No Required Changes)

- **Distributed Locking:** Purely additive safety feature.
- **Admin API:** Purely additive operational endpoint.
- **Notifications:** Purely additive visibility feature.
- **This module is PRODUCTION-READY for critical data lifecycle management as-is.**

---

## Module: Users

> **Score:** 8.6/10 ✅ | **Priority:** 🟢 LOW  
> **Standard:** OWASP Password Security / GDPR Compliance / User Lifecycle Management

### Current State Summary

The Users module is **enterprise-grade** with excellent security: Argon2id password hashing with OWASP-recommended parameters (64MB memory, 3 iterations, 4 parallelism), password versioning for lazy migration from bcrypt, GDPR-compliant soft deletion with full data anonymization (name/email/avatar cleared), CSRF protection on password change and delete endpoints, audit logging with severity markers, tenant isolation via organizationId, SuperAdmin guard implementation, secure avatar upload with MIME validation and 5MB limit, and proper database indexes. Minor gaps: **no email verification** on registration, **weak password policy** (only 6 character minimum), and **no rate limiting** on password change.

### Industry Standard Target

**How Auth0/Okta/Google Identity Engineers Build User Systems Today:**

1. **Email Verification (Account Security):** New users should verify email ownership before full access. Prevents account squatting and improves deliverability.

2. **Strong Password Policy (Credential Security):** NIST 800-63B recommends 12+ characters with complexity requirements (uppercase, lowercase, number, symbol). Current 6-character minimum is too weak.

3. **Rate Limiting on Sensitive Endpoints (Attack Prevention):** Password change endpoint should be rate-limited to prevent brute force attacks.

4. **Login History (Account Security):** Track login attempts with device/IP for security auditing. Enables "suspicious login" detection.

### The Fix Strategy

**Phase 1 - Email Verification (Week 1 - Optional):**  
Add `emailVerified` boolean and `emailVerificationToken` columns to User entity. On registration, send verification email with secure token. Gate certain features behind verification status. Add `/users/verify-email/:token` endpoint.

**Phase 2 - Stronger Password Policy (Week 1 - Optional):**  
Create `PasswordPolicyService` with complexity validation: minimum 12 characters, at least one uppercase, one lowercase, one number, one symbol. Add `zxcvbn` library for password strength scoring. Reject common passwords.

**Phase 3 - Rate Limiting on Password Change (Week 1 - Optional):**  
Add `@Throttle({ default: { limit: 5, ttl: 3600000 } })` to password change endpoint. 5 attempts per hour prevents brute force while allowing legitimate retries.

**Phase 4 - Login History (Week 2 - Optional):**  
Create `LoginHistory` entity with: userId, ipAddress, userAgent, deviceFingerprint, timestamp, success boolean. Track in auth service. Provide `/users/me/login-history` endpoint. Enable "was this you?" security notifications.

### Migration Risk

**Risk Level:** 🟢 LOW (No Required Changes)

- **Email Verification:** New users would need to verify. Existing users can be grandfathered or required to verify.
- **Password Policy:** Applies only to new passwords—existing passwords continue to work.
- **Rate Limiting:** May block legitimate rapid password changes. Adjust limits as needed.
- **This module is PRODUCTION-READY with strong security foundations as-is.**

---

## Module: Organizations

> **Score:** 8.2/10 ✅ | **Priority:** 🟢 LOW  
> **Standard:** Multi-Tenancy / Secure Invitation Flow / SaaS Billing Integration

### Current State Summary

The Organizations module demonstrates **solid enterprise multi-tenancy patterns** with secure invitation workflow: 256-bit hex tokens (64 chars), 7-day expiration with auto-expire cleanup, duplicate prevention (checks existing member AND pending invite), email notification via EmailService. Stripe billing integration ready with stripeCustomerId, stripeSubscriptionId, subscriptionStatus columns. SuperAdmin authorization with same-org validation, URL-friendly slug generation. Minor gaps: **no CSRF protection** on invite/revoke endpoints and **no rate limiting** on invite creation (invite spam possible).

### Industry Standard Target

**How Slack/GitHub/Stripe Engineers Build Organization/Tenant Systems Today:**

1. **Secure Invitation Tokens (Security):** ✅ ALREADY IMPLEMENTED. 256-bit tokens with 7-day expiration.

2. **CSRF Protection on State-Changing Endpoints (Security):** Invite creation and revocation modify state and should be CSRF-protected.

3. **Rate Limiting on Invitation (Abuse Prevention):** Limit invite creation to prevent email spam. Typical: 10 invites per minute.

4. **Stripe Webhook Handler (Billing):** Handle subscription lifecycle events (payment_succeeded, subscription_canceled, etc.) to update organization status.

5. **Organization Settings (Customization):** Allow org admins to customize logo, timezone, default project settings.

### The Fix Strategy

**Phase 1 - CSRF Protection (Week 1):**  
Add `@RequireCsrf()` decorator to `POST /organizations/:id/invites` and `DELETE /organizations/:id/invites/:inviteId`. This prevents cross-site request forgery attacks.

**Phase 2 - Rate Limiting on Invite Creation (Week 1):**  
Add `@Throttle({ default: { limit: 10, ttl: 60000 } })` to invite creation endpoint. 10 invites per minute prevents email spam while allowing legitimate bulk invites.

**Phase 3 - Stripe Webhook Handler (Week 2 - Optional):**  
Create `StripeWebhookController` with signature verification. Handle events: `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`. Update organization subscriptionStatus accordingly.

**Phase 4 - Organization Settings (Week 2 - Optional):**  
Add `OrganizationSettings` entity with: logo URL, timezone, default project visibility, allowed email domains for invites. Create settings management endpoints.

### Migration Risk

**Risk Level:** 🟢 LOW

- **CSRF Protection:** May cause 403 errors for requests missing CSRF token. Coordinate with frontend.
- **Rate Limiting:** May block bulk invite operations. Adjust limits or provide admin override.
- **Stripe Webhooks:** Purely additive integration.
- **This module is PRODUCTION-READY for SaaS multi-tenancy as-is.**

---

## Module: Membership

> **Score:** 7.8/10 ✅ | **Priority:** 🟡 MEDIUM  
> **Standard:** Project-Level RBAC / Composite Key Design / Dual Role Migration Pattern

### Current State Summary

The Membership module provides **solid project member management** with permission guards (JwtAuthGuard + PermissionsGuard), granular permissions (members:view/add/remove), role validation via `@IsIn()` decorator, composite primary key (projectId + userId) preventing duplicates, cascade delete on both Project and User, 4 database indexes, and a clever **dual role system** (legacy enum-based roleName + new dynamic roleId FK) for gradual RBAC migration. Minor gaps: **no CSRF protection** on add/remove/update endpoints and **no audit logging** for member changes.

### Industry Standard Target

**How Jira/Asana/Linear Engineers Build Team Membership Systems Today:**

1. **CSRF Protection on Mutations (Security):** Add/remove/update member operations modify state and should be CSRF-protected.

2. **Audit Logging for Member Changes (Compliance):** Member additions, removals, and role changes are sensitive operations that should be tracked in audit log. Important for security auditing and compliance.

3. **Role Hierarchy (Authorization):** Define role hierarchy (ProjectLead > Developer > Viewer) for permission inheritance.

4. **Event-Driven Member Changes (Integration):** Emit events on member add/remove for notifications, activity feeds, and other systems.

### The Fix Strategy

**Phase 1 - CSRF Protection (Week 1):**  
Add `@RequireCsrf()` decorator to `POST /project-members`, `DELETE /project-members/:userId`, and `PATCH /project-members/:userId`. These state-changing operations require CSRF protection.

**Phase 2 - Audit Logging (Week 1):**  
Inject `AuditService` into `ProjectMembersService`. In `addMemberToProject()`, log `MEMBER_ADDED` event with projectId, userId, roleName. In `removeMember()`, log `MEMBER_REMOVED`. In `updateRole()`, log `MEMBER_ROLE_CHANGED` with old and new role.

**Phase 3 - Event Emission (Week 2 - Optional):**  
Inject `EventEmitter2` and emit events: `member.added`, `member.removed`, `member.role.changed`. This enables notification integration and activity feeds.

**Phase 4 - Role Hierarchy (Week 2 - Optional):**  
Define role hierarchy in RBAC module: ProjectLead inherits all Developer permissions, Developer inherits all Viewer permissions. Enables cleaner permission checks.

### Migration Risk

**Risk Level:** 🟢 LOW

- **CSRF Protection:** May cause 403 errors for requests missing CSRF token. Coordinate with frontend.
- **Audit Logging:** Purely additive—new records accumulate.
- **Event Emission:** Purely additive integration.
- **This module is PRODUCTION-READY with minor security hardening needed.**

---

## Module: Invites

> **Score:** 8.3/10 ✅ | **Priority:** 🟢 LOW  
> **Standard:** Secure Token Generation / Status State Machine / Event-Driven Architecture

### Current State Summary

The Invites module provides **comprehensive project invitation workflow** with secure 32-byte crypto random tokens, unique database constraint, configurable expiration via `expiresInHours`, complete status state machine (Pending/Accepted/Rejected/Revoked), event-driven architecture with EventEmitter2 (4 event types: created, revoked, resend, responded), ownership-based revoke permissions, invitee validation, and automatic project member addition on acceptance. Minor gaps: **no CSRF protection** on create/revoke/resend/respond endpoints and **expiry not validated** when responding to invite (field exists but not checked).

### Industry Standard Target

**How Notion/Figma/Linear Engineers Build Invitation Systems Today:**

1. **CSRF Protection on Mutations (Security):** All state-changing invitation endpoints (create, revoke, resend, respond) should be CSRF-protected.

2. **Expiration Validation (Business Logic):** When responding to an invite, check if `expiresAt < now()`. Auto-expire and reject if expired. Current implementation stores expiration but doesn't enforce it.

3. **Email Invites for External Users (Growth):** Allow inviting by email even if user isn't registered. Creates pending invite that can be claimed after registration.

4. **Bulk Invite (Efficiency):** Allow inviting multiple users at once for onboarding teams.

### The Fix Strategy

**Phase 1 - CSRF Protection (Week 1):**  
Add `@RequireCsrf()` decorator to `POST /invites`, `PATCH /invites/:id/revoke`, `POST /invites/:id/resend`, and `POST /invites/:id/respond`. These state-changing operations require CSRF protection.

**Phase 2 - Expiration Validation (Week 1):**  
In `respondToInvite()` method, add expiry check before processing response: if `invite.expiresAt && invite.expiresAt < new Date()`, update status to 'Expired' and throw `BadRequestException('Invite has expired')`. This enforces the expiration that's already being tracked.

**Phase 3 - Email-Based Invites (Week 2 - Optional):**  
Allow inviting by email when user doesn't exist yet. Store `inviteeEmail` in addition to `inviteeId`. On user registration, check for pending invites by email and link them. This enables external user onboarding.

**Phase 4 - Bulk Invite (Week 2 - Optional):**  
Add `POST /invites/bulk` endpoint accepting array of emails/userIds. Process invites in batch with individual error handling. Emit single `invite.bulk.created` event for efficiency.

### Migration Risk

**Risk Level:** 🟢 LOW

- **CSRF Protection:** May cause 403 errors for requests missing CSRF token. Coordinate with frontend.
- **Expiration Validation:** May reject previously-acceptable expired invites. This is correct behavior.
- **Email Invites:** Purely additive feature.
- **This module is PRODUCTION-READY with minor security hardening needed.**

---

## Module: Billing

> **Score:** 8.8/10 ✅ | **Priority:** 🟢 LOW  
> **Standard:** Stripe Integration / Webhook Security / SaaS Subscription Management

### Current State Summary

The Billing module demonstrates **excellent enterprise SaaS patterns** with official Stripe SDK integration, webhook signature verification via `constructEvent()`, CSRF protection on checkout and portal endpoints, JWT authentication, comprehensive audit logging (BILLING_CHECKOUT_INITIATED, SUBSCRIPTION_UPDATED, SUBSCRIPTION_CANCELLED with CRITICAL severity), auto-create customer with orgId metadata, subscription data sync (status + period end), and graceful fallback when API key not configured. Minor gaps: **missing user/org validation** on checkout (any user could create checkout for any org) and **limited webhook events** (only 3 of many critical events handled).

### Industry Standard Target

**How Stripe/Chargebee/Recurly Engineers Build Billing Systems Today:**

1. **User/Org Authorization (Security):** Validate that requesting user belongs to the organization and has admin privileges before allowing billing operations.

2. **Comprehensive Webhook Events (Reliability):** Handle all critical Stripe events: `invoice.payment_failed` (payment issues), `customer.subscription.trial_will_end` (trial warnings), `invoice.payment_succeeded` (confirmations), `invoice.upcoming` (pre-billing notifications).

3. **Usage-Based Billing (Monetization):** For metered plans, track usage and report to Stripe for billing.

4. **Invoice History (Transparency):** Provide endpoint to list past invoices and payment history.

### The Fix Strategy

**Phase 1 - User/Org Authorization (Week 1):**  
In `createCheckout()`, validate `req.user.organizationId === body.orgId` before proceeding. Additionally, check that user has billing admin privileges (isSuperAdmin or specific billing permission). Return 403 if validation fails. This prevents unauthorized billing operations.

**Phase 2 - Additional Webhook Events (Week 1):**  
Add handlers for: `invoice.payment_failed` (send notification, update status), `customer.subscription.trial_will_end` (send trial ending email), `invoice.payment_succeeded` (confirmation notification), `invoice.upcoming` (upcoming charge notification). Each event should trigger appropriate notification and audit logging.

**Phase 3 - Invoice History Endpoint (Week 2 - Optional):**  
Add `GET /billing/invoices` endpoint that calls `stripe.invoices.list({ customer: customerId })`. Return list of invoices with status, amount, date, PDF link. Enables users to view billing history.

**Phase 4 - Usage-Based Billing (Week 2 - Optional):**  
Create `UsageService` that tracks metered usage (API calls, storage, users). Add cron job to report usage to Stripe via `stripe.subscriptionItems.createUsageRecord()`. Enables metered billing plans.

### Migration Risk

**Risk Level:** 🟢 LOW

- **User/Org Authorization:** Will correctly block unauthorized billing—may surface existing bugs.
- **Webhook Events:** Purely additive event handlers.
- **Invoice History:** Purely additive read endpoint.
- **This module is PRODUCTION-READY for SaaS billing as-is.**

---

## Module: Gamification

> **Score:** 5.8/10 ⚠️ | **Priority:** 🟡 MEDIUM  
> **Standard:** Achievement Systems / Leaderboards / User Engagement Patterns

### Current State Summary

The Gamification module is a **minimal MVP** with basic achievement structure: entity with slug/name/description/icon/xp, UserAchievement join table, slug indexing, duplicate prevention before unlock, event-driven architecture via `@OnEvent('sprint.event')`, auto-seeding with idempotent defaults, and XP points foundation. However, it is **NOT enterprise-grade**: **no API endpoints** (no controller exposing achievements to users), **no leaderboards**, **no unlock notifications** (users don't know when they earn badges), **only one achievement defined**, and **only one event handler** (sprint.event only).

### Industry Standard Target

**How Duolingo/GitHub/Stack Overflow Engineers Build Gamification Systems Today:**

1. **Controller/API Endpoints (User Experience):** Users need to view their achievements, total XP, and progress. Must have `GET /achievements`, `GET /achievements/my`, `GET /leaderboard`.

2. **Leaderboard Calculation (Competition):** Weekly/monthly/all-time leaderboards by XP. Use Redis sorted sets for efficient ranking.

3. **Unlock Notifications (Engagement):** When achievement unlocked, emit event for real-time WebSocket notification. Show toast/modal in UI.

4. **Multiple Event Handlers (Coverage):** Listen to many events: issue.created (First Issue), issue.resolved (Bug Hunter), comment.created (Collaborator), etc.

5. **Progress Tracking (Motivation):** For multi-step achievements (e.g., "Create 10 issues"), track progress and show "7/10 completed".

### The Fix Strategy

**Phase 1 - Create GamificationController (Week 1):**  
Add controller with JWT guard. Endpoints: `GET /gamification/achievements` (list all), `GET /gamification/my-achievements` (user's unlocked), `GET /gamification/xp` (user's total XP), `GET /gamification/leaderboard` (top users by XP).

**Phase 2 - Unlock Notifications (Week 1):**  
In `unlockAchievement()`, emit `achievement.unlocked` event with userId and achievement details. Create listener in NotificationsModule that sends WebSocket notification to user.

**Phase 3 - Add More Achievements (Week 2):**  
Seed additional achievements: first-issue (create first issue), bug-hunter (resolve 10 bugs), early-bird (log in before 7am), collaborator (comment on 50 issues), team-player (invite 5 members). Add corresponding event handlers.

**Phase 4 - Progress Tracking (Week 2):**  
Create `AchievementProgress` entity tracking: userId, achievementSlug, currentCount, targetCount. Update on relevant events. Expose in API.

**Phase 5 - Leaderboard with Redis (Week 3 - Optional):**  
Use Redis sorted set `ZADD leaderboard xp userId`. On XP change, update score. `ZREVRANGE` for top users. Enables real-time competitive leaderboards.

### Migration Risk

**Risk Level:** 🟢 LOW

- **Controller Addition:** Purely additive—new endpoints.
- **Notifications:** Purely additive event emission.
- **More Achievements:** New achievements accumulate—existing unlocks preserved.
- **Existing foundation is solid, needs feature expansion.**

---

## Module: Satisfaction

> **Score:** 7.2/10 ⚠️ | **Priority:** 🟡 MEDIUM  
> **Standard:** NPS (Net Promoter Score) / User Feedback / CSAT Analytics

### Current State Summary

The Satisfaction module provides **solid user feedback tracking** with NPS-style surveys, multi-question JSONB storage, metric tracking with context, database aggregations (AVG calculations), composite indexes for performance, JWT + PermissionsGuard authorization, and proper user scoping. However, it is **limited to user-level tracking** only: **no CSRF protection** on POST endpoints (submit-survey, track-metric), **no admin-level reporting** (cannot see org-wide satisfaction), and **no proper NPS calculation** (industry-standard promoter/detractor formula not implemented).

### Industry Standard Target

**How Zendesk/Intercom/Delighted Engineers Build Satisfaction Systems Today:**

1. **CSRF Protection on Survey Submission (Security):** All POST endpoints that submit data should be CSRF-protected.

2. **NPS Calculation (Industry Standard):** Standard NPS formula: `((Promoters - Detractors) / Total) × 100`. Promoters score 9-10, Detractors score 0-6.

3. **Admin/Org-Wide Reporting (Management):** Admins need to see org-wide satisfaction, not just individual user scores. Dashboards with trends over time.

4. **Time-Range Filtering (Trends):** Filter satisfaction by date range to track trends (weekly, monthly, quarterly).

### The Fix Strategy

**Phase 1 - CSRF Protection (Week 1):**  
Add `@RequireCsrf()` decorator to `POST /satisfaction/track-metric` and `POST /satisfaction/submit-survey`. These state-changing operations require CSRF protection.

**Phase 2 - NPS Calculation (Week 1):**  
Create `calculateNPS(orgId)` method that queries surveys, categorizes by score: Promoters (9-10), Passives (7-8), Detractors (0-6). Apply formula: `((promoterCount - detractorCount) / totalCount) × 100`. Return NPS score with counts.

**Phase 3 - Admin Reporting Endpoint (Week 2):**  
Add `GET /satisfaction/admin/org/:orgId/overview` protected by admin permission. Return: overall NPS, satisfaction by survey type, trends over time, response count. This enables management dashboards.

**Phase 4 - Time-Range Filtering (Week 2 - Optional):**  
Add `startDate` and `endDate` query parameters to analytics endpoints. Filter by `createdAt BETWEEN :startDate AND :endDate`. Enables trend analysis.

### Migration Risk

**Risk Level:** 🟢 LOW

- **CSRF Protection:** May cause 403 errors for requests missing CSRF token. Coordinate with frontend.
- **NPS Calculation:** Purely additive analytics method.
- **Admin Reporting:** Purely additive endpoint with new permission.
- **This module has good foundations, needs reporting expansion.**

---

## Module: Search

> **Score:** 8.5/10 ✅ | **Priority:** 🟢 LOW  
> **Standard:** PostgreSQL Full-Text Search / Query Sanitization / Tenant-Isolated Search

### Current State Summary

The Search module demonstrates **excellent enterprise patterns** with PostgreSQL tsvector full-text search, GIN index utilization for performance, query sanitization via regex escape of special PostgreSQL operators (prevents SQL injection), strict tenant isolation via TenantContext with ForbiddenException if missing, ts_rank ordering for relevance-based results, parallel queries with Promise.all, 2-character minimum query length, result limits (20 issues, 5 projects), and JWT authentication. Minor gaps: **user search not implemented** (returns empty array with TODO comment), **no result caching** for frequent queries, and **no pagination** for large result sets.

### Industry Standard Target

**How Algolia/Elasticsearch/PostgreSQL Full-Text Engineers Build Search Systems Today:**

1. **User Search (Completeness):** All searchable entities should be included. User search via organization membership join is missing.

2. **Result Caching (Performance):** Cache frequent search queries with short TTL (30s-60s). Reduces database load for repeated queries.

3. **Pagination (UX):** For large result sets, implement offset/limit or cursor-based pagination. Current fixed limits may miss relevant results.

4. **Search Analytics (Insights):** Track what users search for (anonymized). Helps improve search quality and content discovery.

### The Fix Strategy

**Phase 1 - Implement User Search (Week 1 - Optional):**  
Replace the empty array with actual user search. Join ProjectMember on organizationId, search users by name/email using tsvector or ILIKE. Return users within the same organization.

**Phase 2 - Add Result Caching (Week 1 - Optional):**  
Inject CacheService. Cache key: `search:{orgId}:{query}:{type}`. TTL: 30-60 seconds. Check cache before database query. Invalidate on relevant entity changes if needed.

**Phase 3 - Add Pagination (Week 2 - Optional):**  
Add `page` and `limit` query parameters. Use `skip(offset).take(limit)` in TypeORM. Return total count in response for UI pagination. Consider cursor-based pagination for large datasets.

**Phase 4 - Search Analytics (Week 2 - Optional):**  
Track search queries (hash or anonymize sensitive terms). Store: query, resultCount, userId, timestamp. Use for improving search quality and content gaps.

### Migration Risk

**Risk Level:** 🟢 LOW (No Required Changes)

- **User Search:** Purely additive feature—fills empty implementation.
- **Caching:** Pure performance improvement.
- **Pagination:** Additive parameters—backward compatible.
- **This module is PRODUCTION-READY for enterprise search as-is.**

---

## Module: User-Preferences

> **Score:** 9.0/10 ✅ 🏆 | **Priority:** 🟢 LOW  
> **Standard:** AI-Powered Personalization / Behavior Learning / JSONB Preference Storage

### Current State Summary

The User-Preferences module demonstrates **exceptional enterprise personalization** with AI-powered smart defaults via ProjectIntelligenceService integration with graceful rule-based fallback, 4 behavior learning patterns (issue creation, assignment, velocity, time tracking), JSONB preferences storage with typed TypeScript interfaces, deep merge updates for nested objects, auto-create preferences on first access, onboarding progress tracking, usage analytics (sessions, features, score), 8+ granular notification types, working hours with timezone support, and unique index on userId with CASCADE delete. Only gap: **no CSRF protection** on preferences update endpoint.

### Industry Standard Target

**How Spotify/Netflix/LinkedIn Engineers Build Personalization Systems Today:**

1. **CSRF Protection on Updates (Security):** Preference update endpoint modifies state and should be CSRF-protected.

2. **Preference Export (GDPR Compliance):** Users should be able to export their preference data for GDPR compliance.

3. **Preference History/Undo (UX):** Track preference changes to enable undo functionality.

4. **A/B Testing Integration (Experimentation):** Preferences system should integrate with A/B testing for feature flags.

### The Fix Strategy

**Phase 1 - CSRF Protection (Week 1):**  
Add `@RequireCsrf()` decorator to `PATCH /user-preferences/me` endpoint. This state-changing operation requires CSRF protection.

**Phase 2 - Preference Export (Week 1 - Optional GDPR):**  
Add `GET /user-preferences/me/export` endpoint that returns complete preference data in JSON format. Include all JSONB fields and metadata. This enables GDPR data portability.

**Phase 3 - Preference History (Week 2 - Optional):**  
Create `PreferenceHistory` entity tracking changes: userId, fieldPath, oldValue, newValue, changedAt. Store in `updatePreferences()`. Add `POST /user-preferences/me/undo` to revert last change.

**Phase 4 - Rate Limiting (Week 2 - Low Priority):**  
Add `@Throttle()` to preferences update to prevent excessive updates. Limit to 30 updates per minute.

### Migration Risk

**Risk Level:** 🟢 LOW (No Required Changes)

- **CSRF Protection:** May cause 403 errors for requests missing CSRF token. Coordinate with frontend.
- **Preference Export:** Purely additive read endpoint.
- **Preference History:** Purely additive tracking feature.
- **This is one of the BEST-DESIGNED modules in the codebase.**

---

## Module: Watchers

> **Score:** 8.0/10 ✅ | **Priority:** 🟢 LOW  
> **Standard:** Subscription-Based Notifications / Event-Driven / Watcher Pattern

### Current State Summary

The Watchers module provides **solid subscription-based notification functionality** with idempotent toggle watch/unwatch on same endpoint, membership verification before all operations via `getUserRole()`, parallel watcher queries with Promise.all, actor exclusion from self-notification, dual notification strategy (live via NotificationsEmitter + persisted via EventEmitter2), cascade deletes on User/Project/Issue, permission decorators (watchers:view/update), and clean response format. Minor gaps: **no CSRF protection** on POST toggle endpoints and **no explicit database indexes** on projectId/issueId columns.

### Industry Standard Target

**How GitHub/Jira/Notion Engineers Build Watcher/Subscription Systems Today:**

1. **CSRF Protection on Toggle (Security):** Watch toggle endpoints modify state and should be CSRF-protected.

2. **Database Indexes (Performance):** projectId and issueId columns should have explicit indexes for efficient watcher lookups. Composite indexes for [userId, projectId] and [userId, issueId] for unique constraint.

3. **Batch Watch Operations (Efficiency):** Allow watching/unwatching multiple issues at once.

4. **Watch Preferences (Customization):** Allow per-watch notification preferences (all updates vs mentions only vs status changes only).

### The Fix Strategy

**Phase 1 - CSRF Protection (Week 1):**  
Add `@RequireCsrf()` decorator to `POST /projects/:projectId/watchers` and `POST /issues/:issueId/watchers`. These state-changing operations require CSRF protection.

**Phase 2 - Database Indexes (Week 1):**  
Add explicit index decorators to Watcher entity: `@Index('IDX_watcher_project')` on projectId, `@Index('IDX_watcher_issue')` on issueId, `@Index('IDX_watcher_user_project', ['userId', 'projectId'])` composite, `@Index('IDX_watcher_user_issue', ['userId', 'issueId'])` composite. This improves query performance.

**Phase 3 - Batch Operations (Week 2 - Optional):**  
Add `POST /projects/:projectId/watchers/batch` accepting array of issueIds. Process watches in loop with error handling per item. Return { success: count, failed: count }.

**Phase 4 - Watch Preferences (Week 2 - Optional):**  
Add `preference` column to Watcher entity (enum: ALL, MENTIONS_ONLY, STATUS_CHANGES). Use in notification filtering.

### Migration Risk

**Risk Level:** 🟢 LOW

- **CSRF Protection:** May cause 403 errors for requests missing CSRF token. Coordinate with frontend.
- **Database Indexes:** Add-only migration—improves performance.
- **Batch Operations:** Purely additive endpoint.
- **This module is PRODUCTION-READY with minor optimizations needed.**

---

## Module: Onboarding

> **Score:** 8.7/10 ✅ | **Priority:** 🟢 LOW  
> **Standard:** Guided User Onboarding / Step-Based Progress Tracking / Product-Led Growth

### Current State Summary

The Onboarding module demonstrates **exceptional enterprise UX patterns** with 11-step guided workflow (Welcome → Completed), enum-based type-safe steps, status tracking (PENDING/IN_PROGRESS/COMPLETED/SKIPPED), skip with optional reason tracking, step timestamps (startedAt/completedAt/skippedAt), context tracking (projectType, teamSize, methodology), analytics fields (timeSpent, hintsUsed, articlesViewed), per-step hints and next steps guidance, estimated time per step, idempotent initialization, reset functionality, composite index [userId, projectId], and CASCADE deletes. Minor gaps: **no CSRF protection** on POST endpoints and **no EventEmitter2 completion events** for gamification integration.

### Industry Standard Target

**How Intercom/Mixpanel/Notion Engineers Build Onboarding Systems Today:**

1. **CSRF Protection on All Mutations (Security):** Initialize, skip, complete, and reset operations modify state and should be CSRF-protected.

2. **EventEmitter2 Completion Events (Integration):** Emit events on step and onboarding completion for gamification, analytics, and notification integration.

3. **A/B Test Different Flows (Experimentation):** Different onboarding sequences for different user types or experiments.

4. **Conversion Tracking (Analytics):** Track drop-off rates at each step for funnel optimization.

### The Fix Strategy

**Phase 1 - CSRF Protection (Week 1):**  
Add `@RequireCsrf()` decorator to `POST /onboarding/initialize`, `POST /onboarding/step/:stepId/skip`, `POST /onboarding/complete`, and `POST /onboarding/reset`. These state-changing operations require CSRF protection.

**Phase 2 - Event Emission (Week 1):**  
Inject EventEmitter2. Emit `onboarding.step.completed` event with userId, projectId, stepId on step completion. Emit `onboarding.completed` when reaching COMPLETED status. This enables gamification achievement triggers.

**Phase 3 - Gamification Integration (Week 2 - Optional):**  
Create event listener in GamificationModule that unlocks "Onboarding Champion" achievement when `onboarding.completed` event fires. Awards XP bonus for completing all steps without skipping.

**Phase 4 - Conversion Analytics (Week 2 - Optional):**  
Track step-by-step conversion rates. Store analytics: stepId, startedCount, completedCount, skippedCount, avgTimeSpent. Enables funnel optimization.

### Migration Risk

**Risk Level:** 🟢 LOW

- **CSRF Protection:** May cause 403 errors for requests missing CSRF token. Coordinate with frontend.
- **Event Emission:** Purely additive—new events won't break existing flows.
- **Gamification:** Purely additive achievement integration.
- **This module is PRODUCTION-READY with excellent UX design.**

---

## Module: Revisions

> **Score:** 9.1/10 ✅ 🏆 | **Priority:** 🟢 LOW  
> **Standard:** Event Sourcing Lite / Audit Trail / Change Data Capture / Rollback Capability

### Current State Summary

The Revisions module demonstrates **exceptional enterprise audit trail patterns** with TypeORM subscriber for automatic capture (afterInsert/beforeUpdate/beforeRemove), 7 watched entity types (Project/Issue/Sprint/Board/Release/Label/Component), full JSONB snapshots preserving entity state, comprehensive diff service with 20+ tracked fields and custom formatters, human-readable change summaries ("Status: To Do → In Progress"), rollback functionality restoring entities from snapshots, activity history with ordered diffs, field metadata with labels, deep equality comparison for Date/Array/Object, and database indexes on entityType/entityId with permission guards. Minor gaps: **no CSRF protection** on rollback endpoint and **tenant isolation not explicit** in revision queries.

### Industry Standard Target

**How GitHub/Notion/Linear Engineers Build Revision/Audit Trail Systems Today:**

1. **CSRF Protection on Rollback (Security):** Rollback is a destructive operation that modifies entity state and must be CSRF-protected.

2. **Tenant Isolation (Multi-Tenancy):** Ensure revision queries are scoped by organizationId to prevent cross-tenant access.

3. **Revision Pruning (Data Management):** For long-running systems, implement retention policy to archive/delete old revisions (e.g., keep 90 days, archive 1 year, delete older).

4. **Comparison View (UX):** Allow comparing any two revisions, not just sequential changes.

### The Fix Strategy

**Phase 1 - CSRF Protection (Week 1):**  
Add `@RequireCsrf()` decorator to `POST /revisions/:revisionId/rollback`. This destructive state-changing operation requires CSRF protection.

**Phase 2 - Tenant Isolation (Week 1):**  
Enhance revision queries to include organizationId filter. In `getHistory()` and `getRevision()`, ensure entityId lookup is scoped by tenant context. This prevents cross-tenant access.

**Phase 3 - Revision Pruning (Week 2 - Optional):**  
Create scheduled task `RevisionPruningJob` that runs weekly. Archive revisions older than 90 days to cold storage. Delete archived revisions older than 1 year. This manages database growth.

**Phase 4 - Comparison View (Week 2 - Optional):**  
Add `GET /revisions/compare/:revisionA/:revisionB` endpoint. Run diff service on two arbitrary snapshots. Enables "compare any versions" UI feature.

### Migration Risk

**Risk Level:** 🟢 LOW (No Required Changes for Production)

- **CSRF Protection:** May cause 403 errors for requests missing CSRF token. Coordinate with frontend.
- **Tenant Isolation:** Defense-in-depth—existing permission guards provide protection.
- **Revision Pruning:** Purely additive scheduled task.
- **This is one of the BEST-DESIGNED modules in the codebase.**

---

## Module: Work-Logs

> **Score:** 7.5/10 ⚠️ | **Priority:** 🟡 MEDIUM  
> **Standard:** Time Tracking / Time Aggregation / Billing Integration / Timer Functionality

### Current State Summary

The Work-Logs feature (embedded in issues module) provides **functional basic time tracking** with full CRUD operations (list/add/update/delete), ownership validation (only owner or ProjectLead can edit/delete), issue existence validation, user relation loading on list, cascade deletes on Issue/Project/User foreign keys, optional note field for descriptions, and minutes integer storage. However, it is **missing enterprise features**: **no CSRF protection** on mutation endpoints, **no time aggregation** (per issue/project/user totals), **no timer feature** (start/stop tracking), and **no billing integration** for invoicing.

### Industry Standard Target

**How Harvest/Toggl/Jira Time Tracking Engineers Build Work-Log Systems Today:**

1. **CSRF Protection on Mutations (Security):** Add/update/delete work log operations modify state and should be CSRF-protected.

2. **Time Aggregation (Reporting):** Calculate totals per issue, per project, per user, per sprint. Essential for project management and reporting.

3. **Timer Feature (UX):** Start/stop timer that automatically creates work log entry. Improves accuracy over manual entry.

4. **Billing Integration (Monetization):** Connect time entries to billing. Calculate billable hours by rate. Generate invoices.

### The Fix Strategy

**Phase 1 - CSRF Protection (Week 1):**  
Add `@RequireCsrf()` decorator to `POST /issues/:issueId/worklogs`, `PATCH /issues/:issueId/worklogs/:workLogId`, and `DELETE /issues/:issueId/worklogs/:workLogId`. These state-changing operations require CSRF protection.

**Phase 2 - Time Aggregation (Week 1):**  
Create `WorkLogsService.getTimeAggregation()` methods: `getTotalTimeByIssue(issueId)`, `getTotalTimeByProject(projectId)`, `getTotalTimeByUser(userId, dateRange)`, `getTotalTimeBySprint(sprintId)`. Use database SUM aggregations. Return formatted hours/minutes.

**Phase 3 - Timer Feature (Week 2 - Optional):**  
Create `ActiveTimer` entity with: userId, issueId, startedAt. Add endpoints: `POST /timer/start`, `POST /timer/stop` (creates WorkLog from duration), `GET /timer/status`. Store in Redis for fast access.

**Phase 4 - Billing Integration (Week 2 - Optional):**  
Add `billable` boolean and `hourlyRate` fields to WorkLog. Create `BillableTimeService` that calculates: totalBillableMinutes, totalAmount. Integration with Billing module for invoice generation.

### Migration Risk

**Risk Level:** 🟢 LOW

- **CSRF Protection:** May cause 403 errors for requests missing CSRF token. Coordinate with frontend.
- **Time Aggregation:** Purely additive analytics methods.
- **Timer Feature:** Purely additive feature—new entity and endpoints.
- **This feature is PRODUCTION-USABLE for basic time tracking as-is.**

---

# 🎉 REMEDIATION PLAN COMPLETE

**Final Statistics:**
- **Total Modules Remediated:** 50/50 (100%)
- **Average Module Score:** 7.6/10
- **Top Tier Modules (≥9.0):** tenant, cache, circuit-breaker, audit, health, scheduled-tasks, user-preferences, revisions
- **Critical Modules Needing Work (≤6.0):** custom-fields (3.5), api-keys (5.3), rbac (5.5), email (4.5), attachments (5.5), telemetry (5.5), gateways (5.5), gamification (5.8)

**Common Patterns Identified:**
1. **CSRF Protection:** Nearly all modules need CSRF on POST/PATCH/DELETE endpoints
2. **Rate Limiting:** Many modules lack abuse prevention
3. **Tenant Isolation:** Defense-in-depth layer often missing
4. **Event-Driven Integration:** EventEmitter2 underutilized
5. **Input Validation:** DTO validation inconsistent across modules

**Recommended Implementation Order:**
1. **Week 1-2:** Auth, RBAC, Session (security foundation)
2. **Week 3-4:** Custom-Fields, API-Keys, Email (critical gaps)
3. **Week 5-6:** Remaining modules by priority

*All 50 modules have been analyzed and documented with architectural remediation strategies.*
