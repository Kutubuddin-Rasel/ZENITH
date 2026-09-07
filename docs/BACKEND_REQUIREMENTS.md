# ZENITH Backend Requirements

This document defines what the ZENITH backend must guarantee.

It intentionally does **not** duplicate every endpoint, DTO, entity field, or implementation detail. The code and API schemas describe those details. This document captures the durable product and system invariants that architecture and refactoring must preserve.

---

## 1. Product scope

ZENITH is a multi-tenant project-management platform.

The backend currently spans these major capability areas:

### Identity and access
- organizations;
- users;
- authentication;
- sessions;
- memberships;
- invitations;
- API keys;
- RBAC/CASL authorization;
- CSRF/security controls.

### Project management core
- projects;
- project templates;
- boards;
- issues;
- sprints;
- backlog;
- workflows;
- releases;
- custom fields.

### Collaboration
- comments;
- attachments;
- watchers;
- revisions;
- notifications;
- email.

### Organization and discovery
- taxonomy;
- global search.

### Reporting and intelligence
- reports;
- analytics;
- dashboards;
- telemetry;
- metrics.

### Resource and workflow support
- resource management;
- scheduled tasks;
- user preferences;
- onboarding;
- satisfaction;
- gamification.

### External systems
- integrations;
- webhooks;
- billing;
- storage.

### AI
- AI provider capabilities;
- RAG/ingestion/retrieval.

### Real-time
- WebSocket gateways and event delivery.

The exact endpoint surface remains defined by the code/OpenAPI layer.

---

## 2. Core correctness requirements

### BR-001 — Tenant isolation

All tenant-owned data must be isolated by tenant.

A user must never be able to access or mutate data belonging to another tenant through:
- identifiers;
- search;
- pagination;
- joins;
- indirect relationships;
- background jobs;
- WebSockets;
- reports;
- analytics;
- exports;
- caches.

Tenant isolation must not depend only on a caller remembering to add a filter.

### BR-002 — Authentication

Protected operations require a valid authenticated identity.

Authentication mechanisms must fail closed.

Expired, invalid, revoked, or otherwise unacceptable credentials must not be treated as authenticated.

### BR-003 — Authorization

Authenticated users may perform only operations permitted by applicable organization/project/resource policy.

Authorization must be enforced before:
- sensitive reads;
- administrative changes;
- protected mutations;
- policy changes;
- project/member management;
- exports containing protected data.

Super-admin bypasses, when intentionally supported, must be explicit and auditable.

### BR-004 — Referential integrity

Commands must not create logically orphaned or cross-tenant relationships.

Examples include:
- issue to project;
- issue to sprint;
- issue to workflow status;
- attachment to target;
- comment to target;
- membership to organization/project;
- template-created resources.

### BR-005 — Atomicity

Business operations whose steps form one consistency boundary must either complete together or fail together.

Where database transactions cannot span external systems, the operation must define safe failure/retry behavior.

### BR-006 — Idempotency

Operations exposed to retries or duplicate delivery must be idempotent where duplicate execution could cause:
- duplicate email;
- duplicate webhook;
- duplicate billing operation;
- duplicate resource creation;
- duplicate analytics/event ingestion;
- repeated external side effects.

### BR-007 — Optimistic/concurrent update safety

Concurrent updates must not silently overwrite protected state where optimistic locking/version rules apply.

Conflict behavior must be explicit and observable to callers.

---

## 3. Project-management invariants

### BR-100 — Project ownership boundary

A project is a core tenant-owned aggregate boundary.

Project reads and writes must be scoped to the correct tenant and permission context.

### BR-101 — Project security policy

Project security-policy reads and mutations must enforce appropriate project-level authorization.

Security policy mutation must not be available merely because a caller is authenticated.

### BR-102 — Project security compliance

If the API exposes a compliance endpoint, it must return computed compliance information or a clearly intentional unsupported/error contract.

A hard-coded production success payload must not masquerade as implemented compliance.

### BR-110 — Issue identity

Issue identity/key generation must preserve uniqueness in its defined scope under concurrency.

Counter/key generation must be atomic.

### BR-111 — Issue lifecycle

Issue state changes must respect:
- project ownership;
- workflow status validity;
- allowed transition rules;
- authorization;
- concurrency rules where applicable.

### BR-112 — Issue relationships

Issue links, assignments, sprint relationships, labels/components, and other references must not cross invalid tenant/project boundaries.

### BR-120 — Sprint lifecycle

Sprint creation, activation, completion, membership, metrics, and backlog movement must preserve project/tenant boundaries and lifecycle rules.

### BR-130 — Board ordering

Board columns and issue ordering must remain internally consistent under reorder/move operations.

Moves that imply workflow-state changes must honor workflow transition policy.

### BR-140 — Workflow transitions

A workflow transition must be valid for:
- the source status;
- target status;
- relevant project/workflow;
- applicable policy/authorization.

Transition validation must remain deterministic and testable.

### BR-150 — Template application

Project-template application may create multiple related resources.

If those resources form one required project initialization operation, partial creation must not leave the project in an invalid state.

### BR-160 — Backlog ordering

Backlog ranking/reordering must preserve stable and deterministic ordering within its defined scope.

---

## 4. Collaboration invariants

### BR-200 — Comments

Comment reads/writes must respect target access and tenant boundaries.

### BR-210 — Attachments

Attachment metadata and object-storage access must respect target access and tenant boundaries.

Uploaded files must not become publicly accessible by accident.

Any malware/content scanning policy present in code must fail safely.

### BR-220 — Watchers

Watch/unwatch operations must target valid, accessible resources.

Watcher state must not leak inaccessible resource identities.

### BR-230 — Revisions/auditability

Revision/audit records must represent meaningful protected changes accurately enough to support debugging and accountability.

### BR-240 — Notifications

Notification generation must not expose data to unauthorized recipients.

Duplicate/retry behavior must be safe.

### BR-250 — Email

Transactional email must be retryable without uncontrolled duplication.

Sensitive tokens/links must be generated and handled securely.

---

## 5. Search, reports, analytics

### BR-300 — Search

Global search must:
- enforce tenant scope;
- enforce resource visibility;
- avoid exposing inaccessible entities through titles/snippets/counts;
- paginate deterministically.

Search is a read-model concern and may use purpose-built projections.

### BR-310 — Reports

Reports and exports must:
- honor access control;
- remain tenant-scoped;
- avoid unbounded memory usage for large data sets;
- produce deterministic output for the same snapshot/input where practical.

### BR-320 — Analytics

Read-heavy analytical workloads should not unnecessarily overload the primary transactional database.

ClickHouse may be used for OLAP/aggregate workloads where appropriate.

Analytics pipelines must tolerate retry/duplicate delivery safely.

---

## 6. Integration and webhook requirements

### BR-400 — Provider isolation

External provider-specific implementation details must not leak into unrelated application logic.

### BR-401 — Credential security

Provider credentials/tokens must:
- never be logged in plaintext;
- be encrypted/stored according to the repository security model;
- not be exposed in API responses.

### BR-402 — Outbound reliability

External calls require:
- timeouts;
- bounded retries where safe;
- failure observability;
- circuit breaking where repeated provider failure could destabilize the application.

### BR-410 — Webhook delivery

Webhook delivery must define:
- authentication/signature behavior where supported;
- retry semantics;
- idempotency/duplicate expectations;
- timeout behavior;
- failure state visibility.

Inbound webhook handling must validate authenticity where the provider supports it.

---

## 7. AI and RAG requirements

### BR-500 — Provider abstraction

AI application behavior must not depend unnecessarily on one concrete model provider.

The existing provider abstraction should be preserved where it provides real interchangeability.

### BR-501 — External failure safety

AI provider outages, timeouts, rate limits, or malformed responses must not corrupt core project data.

### BR-502 — Validation

Machine-generated structured output must be validated before it becomes trusted application state.

### BR-503 — Consent and data boundaries

Any AI feature that handles tenant/user content must obey applicable consent, privacy, tenant, and access boundaries present in the product.

### BR-510 — RAG ingestion

RAG ingestion must preserve:
- tenant/document ownership;
- idempotent or safely repeatable ingestion;
- consistent segment/document state under partial failure.

### BR-511 — RAG retrieval

Retrieval must not return context the requester is not permitted to access.

---

## 8. Background processing

### BR-600 — Queue reliability

Background jobs must expose enough state/logging/metrics to diagnose failure.

### BR-601 — Retry semantics

Retries must be safe.

A retry must not assume the previous attempt had zero side effects.

### BR-602 — Worker independence

The architecture should allow queue workers to scale independently of HTTP API processes when operationally needed, while remaining in the same codebase/deployment system unless service extraction is justified.

### BR-603 — Scheduled work

Scheduled jobs must be safe under multi-instance deployment.

A schedule that must execute once globally requires leader/locking/queue semantics rather than accidental execution by every API replica.

---

## 9. Real-time requirements

### BR-700 — Authorization

WebSocket subscriptions and emitted resource data must obey the same access rules as HTTP APIs.

### BR-701 — Horizontal scaling

Real-time delivery should support multiple API/socket instances through the configured shared infrastructure where necessary.

### BR-702 — Event correctness

Events must not leak cross-tenant data.

Event payloads should remain intentionally scoped and versionable.

---

## 10. Security requirements

### BR-800 — Secrets

Secrets must not be:
- committed;
- logged;
- returned to clients;
- included in analytics/telemetry payloads.

### BR-801 — Validation

External input must be structurally validated at the boundary.

Business validation belongs in application/domain logic.

### BR-802 — Rate limiting

Abuse-sensitive endpoints must be covered by appropriate rate limiting.

Rate-limit state must work correctly across horizontally scaled instances.

### BR-803 — Session/token invalidation

Revocation/blacklist/session invalidation behavior must be real and observable.

Statistics or administrative APIs must not return fake sentinel values while appearing implemented.

### BR-804 — Audit logging

Security-sensitive administrative changes should be auditable with actor, target, action, timestamp, and relevant context.

### BR-805 — Error sanitization

API responses must not leak:
- stack traces;
- SQL details;
- secrets;
- provider credentials;
- internal infrastructure topology.

---

## 11. Performance and scalability requirements

### BR-900 — Scale by measurement

Performance work must be evidence-driven.

Microservices are not the default response to a large codebase or hypothetical traffic.

### BR-901 — Horizontal API scale

The stateless portion of the API should be horizontally scalable behind a load balancer.

Shared state must live in appropriate shared infrastructure rather than process memory when correctness requires cross-instance consistency.

### BR-902 — Database efficiency

Critical read/write paths should avoid:
- N+1 query patterns;
- unbounded queries;
- missing pagination;
- avoidable full scans;
- unnecessary transaction length.

Indexing decisions should be driven by real query patterns.

### BR-903 — Cache correctness

Caches must define:
- key scope;
- tenant scope;
- invalidation/TTL strategy;
- stale-data tolerance.

A cache may improve performance but must not become an authorization bypass.

### BR-904 — Heavy workloads

CPU/IO/API-heavy work should be separable into workers where this improves responsiveness or reliability.

### BR-905 — Analytics isolation

High-volume analytics should prefer ClickHouse or dedicated read models where it materially reduces OLTP pressure.

---

## 12. Observability requirements

### BR-1000 — Correlation

Requests and asynchronous work should support correlation/trace identifiers sufficient to follow important operations end-to-end.

### BR-1001 — Structured logging

Production logs should be structured and should include relevant non-secret context.

### BR-1002 — Metrics

The system should expose service/queue/database/business-health metrics sufficient to diagnose bottlenecks and failures.

### BR-1003 — Tracing

External calls, database activity, queue boundaries, and major application operations should be traceable where practical.

### BR-1004 — Health

Health checks must reflect dependencies required for a healthy process without creating self-amplifying failure loops.

---

## 13. Maintainability requirements

### BR-1100 — Stable module APIs

A feature module should expose the minimum stable public surface necessary for other modules.

### BR-1101 — Architecture enforcement

Important module-boundary rules should be enforceable through lint/tests rather than relying only on comments.

### BR-1102 — Type safety

New code should prefer precise types and `unknown` + validation/narrowing over `any`.

Strictness should increase incrementally without blocking unrelated completion work.

### BR-1103 — No fake completion

Production paths must not be marked complete while containing:
- authorization TODOs;
- hard-coded placeholder success responses;
- `NotImplemented`;
- fake metrics;
- deliberate empty implementations.

---

## 14. Testing requirements

### BR-1200 — Characterization before refactor

Risky architecture changes require enough tests to preserve expected behavior.

### BR-1201 — Tenant-isolation tests

Tenant-sensitive repositories and endpoints require tests proving cross-tenant access is rejected or absent.

### BR-1202 — Authorization tests

Sensitive operations require negative tests, not only happy-path tests.

### BR-1203 — Transaction/failure tests

Atomic multi-step operations require tests for partial failure where practical.

### BR-1204 — Queue retry tests

Jobs with external side effects require tests or explicit design verification for duplicate/retry behavior.

### BR-1205 — E2E coverage

Critical user journeys require meaningful E2E/integration coverage.

A default generated “Hello World” E2E test is not sufficient evidence of backend readiness.

---

## 15. Backend completion criteria

The backend is **functionally complete** only when:

- critical domain behavior has no known production placeholders;
- tenant isolation has been audited and tested;
- authorization has been audited and tested;
- project-management core flows pass meaningful integration/E2E tests;
- integration/webhook failure behavior is defined;
- queue retry/idempotency behavior is defined;
- security-sensitive TODOs are resolved;
- build/lint/test CI is trustworthy;
- production runtime/deployment artifacts are consistent;
- observability is sufficient to diagnose failures.

The backend is **architecture complete** only when:

- remaining application-layer persistence leaks are either removed or explicitly accepted;
- sealed/public module boundaries cover important domains;
- avoidable circular dependencies are removed;
- cross-module deep imports are controlled;
- type-safety debt has a bounded accepted remainder;
- the roadmap contains no unclassified architecture migration debt.

The backend is **production-ready** only when both sets of criteria are satisfied and Phase 0/production-readiness gates in `BACKEND_ROADMAP.md` pass.
