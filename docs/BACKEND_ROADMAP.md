# ZENITH Backend Completion Roadmap

This is the persistent execution record for completing the ZENITH backend.

It is intentionally evidence-driven.

---

## 1. Status meanings

- `NOT STARTED` — no verified implementation work begun.
- `IN PROGRESS` — actively being implemented/refactored.
- `BLOCKED` — verification prevented by a named blocker.
- `DONE` — implementation believed complete; full verification not yet complete.
- `VERIFIED` — definition of done passed with evidence.

`DONE != VERIFIED`.

Do not mark a milestone `VERIFIED` based only on code review.

---

## 2. Current architectural assessment

The backend is a sophisticated modular NestJS monolith in the middle of a ports/adapters + selective CQRS migration.

The migration is **heterogeneous**:
- several central domains have strong public boundaries;
- other modules still use direct TypeORM dependencies or concrete-service coupling;
- CI/runtime configuration contains inconsistencies;
- some production paths still contain explicit placeholders/TODOs.

The correct strategy is to **finish and normalize** the existing architecture, not restart it.

---

## 3. Current evidence that must be addressed

### Baseline/CI

- Backend `package.json` requires Node `>=22 <23`.
- GitHub Actions currently uses Node `20`.
- CI runs backend lint and unit tests but not a normal backend `npm run build` PR gate.
- Backend lint script currently uses `--fix`, which is unsuitable as a pure CI verification gate.
- CI references `backend/Dockerfile`, but that file is absent on current `main`.
- `docker-compose.yml` also expects `backend/Dockerfile`.
- `package.json` contains `worker:dev`/`worker:prod` scripts pointing at `src/worker.main.ts` / `dist/worker.main`, while `src/worker.main.ts` is absent on current `main`.
- Existing E2E tests need review; the default application E2E test is not sufficient evidence of backend readiness.

### Security/functional placeholders

`ProjectSecurityPolicyController` currently:
- contains a TODO for proper project-role authorization on policy update;
- returns a hard-coded compliance payload with “not yet implemented”.

These must be treated as real completion blockers, not architecture polish.

### Type safety

Current TypeScript configuration:
- enables `strictNullChecks`;
- has `noImplicitAny: false`;
- is not globally strict.

Backend ESLint currently disables `@typescript-eslint/no-explicit-any`.

Therefore “zero any” is a target, not a verified current invariant.

### Architecture migration

Direct TypeORM/application-layer coupling still exists in areas including:
- Search;
- Taxonomy;
- RAG ingestion;
- Workflows and related legacy services;
- Integrations/Webhooks;
- resource/experience/secondary modules.

Projects/Project Templates remain transitional and still contain module-level `forwardRef` coupling.

---

## 4. Module migration matrix

This table is a planning snapshot, not a substitute for re-auditing a module before work.

Legend:
- ✅ strong/established
- ⚠️ transitional or needs targeted audit
- ❌ known migration debt
- `?` insufficient verification

| Domain | Persistence boundary | Public boundary | Cycle state | Functional completeness | Test confidence | Roadmap state |
|---|---:|---:|---:|---:|---:|---|
| Issues | ✅ | ✅ | ✅ | ⚠️ audit | ? | Audit/maintain |
| Boards | ✅ | ✅ | ✅ | ⚠️ audit | ? | Audit/maintain |
| Sprints | ✅ | ✅ | ✅ | ⚠️ audit | ? | Audit/maintain |
| Backlog | ✅ | ✅ | ✅ | ⚠️ audit | ? | Audit/maintain |
| Comments | ✅ | ✅ | ✅ | ⚠️ audit | ? | Audit/maintain |
| Attachments | ✅ | ✅ | ✅ | ⚠️ audit | ? | Audit/maintain |
| Releases | ✅/⚠️ | ✅ | ✅/⚠️ | ⚠️ audit | ? | Audit/maintain |
| Analytics | ✅ | ✅ | ✅ | ⚠️ audit | ? | Audit/maintain |
| Reports | ✅ | ✅ | ✅ | ⚠️ audit | ? | Audit/maintain |
| Notifications | ✅/⚠️ | ✅ | ⚠️ targeted cycle audit | ⚠️ audit | ? | Audit/maintain |
| Email | ✅/⚠️ | ✅ | ✅/⚠️ | ⚠️ known job-id TODOs | ? | Audit |
| Projects | ⚠️ | ✅ | ⚠️ ProjectTemplates cycle | ❌ security-policy blocker | ? | Phase 2 |
| Project Templates | ❌/⚠️ | ⚠️ | ❌ forwardRef cycles | ⚠️ | ? | Phase 2 |
| Workflows | ❌/⚠️ | ❌/⚠️ | ⚠️ | ? | ? | Phase 1 |
| Search | ❌ | ⚠️ | — | ? | ? | Phase 3 |
| Taxonomy | ❌ | ⚠️ | ? | ? | ? | Phase 3 |
| Watchers | ⚠️ | ⚠️ | ? | ? | ? | Phase 3 |
| Revisions | ⚠️ | ⚠️ | ? | ? | ? | Phase 3 |
| Integrations | ❌/⚠️ | ⚠️ | ? | ? | ? | Phase 4 |
| Webhooks | ❌/⚠️ | ⚠️ | ? | ? | ? | Phase 4 |
| AI | ⚠️ provider abstraction strong; persistence mixed | ⚠️ | ? | ? | ? | Phase 5 |
| RAG | ❌/⚠️ | ⚠️ | ? | ? | ? | Phase 5 |
| Resource Management | ❌/⚠️ | ⚠️ | ? | ? | ? | Phase 6 |
| User Preferences | ❌/⚠️ | ⚠️ | ❌ template cycle | ? | ? | Phase 6 |
| Onboarding | ❌/⚠️ | ⚠️ | ? | ? | ? | Phase 6 |
| Gamification | ❌/⚠️ | ⚠️ | ? | ? | ? | Phase 6 |
| Telemetry | ❌/⚠️ | ⚠️ | ? | ? | ? | Phase 6 |

A module must be re-inspected before changing its status to `VERIFIED`.

---

# Phase 0 — Establish a trustworthy baseline

**Status:** NOT STARTED

## Goal

Make `main` trustworthy enough that architecture refactors can be verified instead of guessed.

## P0.1 Runtime version alignment

**Status:** NOT STARTED

Tasks:
- align CI Node version with backend engine requirement (`22`);
- verify npm version compatibility;
- verify `.nvmrc` and documentation are consistent.

Definition of done:
- `npm ci` succeeds using supported version in CI;
- CI and package engine do not contradict each other.

## P0.2 Non-mutating lint gate

**Status:** NOT STARTED

Tasks:
- split lint verification from lint fixing;
- e.g. `lint` should verify, `lint:fix` should modify;
- keep architecture boundary rules active.

Definition of done:
- CI lint fails on violations without changing repository files.

## P0.3 Build gate

**Status:** NOT STARTED

Tasks:
- add backend `npm run build` to pull-request quality gates;
- ensure build runs independently of Docker.

Definition of done:
- every backend PR must compile successfully before merge.

## P0.4 Docker/runtime artifact consistency

**Status:** NOT STARTED

Tasks:
- determine intended backend Dockerfile;
- restore/create it or correct CI/docker-compose paths;
- verify production entrypoint path (`dist/main` vs `dist/main.js`);
- verify worker topology and whether `worker.main.ts` is intended;
- remove dead scripts or restore the worker bootstrap intentionally.

Definition of done:
- backend image builds;
- docker-compose references real artifacts;
- runtime commands match emitted build artifacts;
- worker scripts correspond to real entrypoints or are removed.

## P0.5 Meaningful E2E baseline

**Status:** NOT STARTED

Tasks:
- audit existing E2E tests;
- remove/replace stale generated assumptions;
- establish at minimum:
  - health/app boot;
  - auth protected path;
  - tenant-isolation path;
  - representative project/issue core flow.

Definition of done:
- E2E suite verifies actual ZENITH behavior.

## P0.6 Project security-policy blocker

**Status:** NOT STARTED

Tasks:
- implement real authorization for policy update/read as required;
- implement compliance behavior or intentionally redesign/remove endpoint contract;
- add negative authorization tests.

Definition of done:
- no “any authenticated caller” security hole;
- no fake compliance success payload;
- tests prove access rules.

## Phase 0 exit gate

Required:
- install PASS;
- lint PASS;
- build PASS;
- unit baseline PASS or documented failures resolved;
- critical E2E PASS;
- tenant-isolation baseline PASS;
- backend Docker build PASS.

Only after this gate should broad refactoring continue.

---

# Phase 1 — Workflows architecture

**Status:** NOT STARTED

## Why first

Workflows is central to projects/issues/boards/templates and still follows an older concrete-service + TypeORM-heavy module style.

Cleaning it gives high leverage and reduces downstream coupling.

## P1.1 Characterize workflows

Tasks:
- inventory controllers/services/entities;
- map consumers;
- map workflow status/transition invariants;
- map transaction boundaries;
- add characterization tests before structural changes.

## P1.2 Persistence boundary

Tasks:
- introduce focused repositories/read-model ports;
- move TypeORM queries out of application services;
- retain TypeORM only inside infrastructure adapters.

Do not create one giant `IWorkflowRepository`.

## P1.3 Split responsibilities

Evaluate meaningful capabilities such as:
- workflow definition query/command;
- status catalog;
- transition policy;
- template operations;
- automation execution;
- analytics.

Split only where responsibilities and callers justify it.

## P1.4 Transition policy

Make workflow transition rules explicit and testable.

Possible form:
- transition policy/state-machine service;
- pure rule evaluation where practical.

Do not force the GoF State Pattern if a simpler policy model is clearer.

## P1.5 Public surface

Tasks:
- export contracts/tokens/ports rather than concrete services where practical;
- migrate consumers;
- remove avoidable TypeOrmModule re-export;
- add sealed import rules.

## P1 exit gate

- behavior preserved;
- no application-layer TypeORM for migrated workflow paths;
- transition rules tested;
- consumers use public surface;
- relevant `forwardRef`/deep imports resolved;
- unit/integration/E2E PASS;
- roadmap updated.

---

# Phase 2 — Finish Projects + Project Templates

**Status:** NOT STARTED

## P2.1 Projects persistence completion

Known debt:
- `ProjectQueryService` still needs concrete `Repository<Project>` for tenant repository construction.

Target:
- explicit project read repository/read-model port;
- tenant isolation inside adapter;
- application layer no longer knows TypeORM.

## P2.2 Project key/counter/locking persistence

Move DB-locking/counter mechanics behind persistence ports.

Concurrency uniqueness must remain tested.

## P2.3 Project Templates persistence

Tasks:
- isolate `ProjectTemplate`, `UserPreferences`, `Project` persistence from application services;
- avoid direct cross-domain repository reach.

## P2.4 Break Project <-> Project Templates cycle

Current state includes module-level `forwardRef`.

Resolve based on real transaction/ownership needs.

Do **not** break atomic project creation merely to eliminate `forwardRef`.

Preferred investigation:
- capability ownership;
- orchestration boundary;
- template application as project initialization capability;
- transaction composition.

## P2.5 ProjectTemplates <-> UserPreferences/Sprints cycles

Remove remaining structural cycles through narrow contracts or ownership correction.

## P2.6 Public surface

Reduce concrete service exports.

Expose only stable capabilities.

## P2 exit gate

- no application-layer TypeORM leakage on targeted paths;
- remaining cycles justified or removed;
- template initialization transaction tested;
- tenant isolation tested;
- project authorization tests pass;
- architecture rules added.

---

# Phase 3 — Core collaboration/support boundaries

**Status:** NOT STARTED

Order:
1. Search
2. Taxonomy
3. Watchers
4. Revisions

## P3.1 Search

Target:
- `GlobalSearchReadPort`;
- purpose-built tenant/visibility-aware read model;
- no direct multi-repository ORM orchestration in `SearchService`;
- move generic pagination types to common/shared area if currently owned by an unrelated domain.

## P3.2 Taxonomy

Refactor only around real responsibilities.

Likely capabilities:
- label catalog;
- component catalog;
- issue taxonomy assignment.

Introduce focused persistence ports.

## P3.3 Watchers

Keep architecture lightweight if domain remains simple.

Likely:
`Controller -> Service -> Repository Port`

Do not introduce CQRS unless complexity proves it useful.

## P3.4 Revisions

Clarify:
- audit/revision ownership;
- write path;
- read path;
- tenant visibility;
- relationship to audit logs.

## P3 exit gate

Each module:
- public boundary defined;
- persistence isolated;
- tenant/access behavior tested;
- architecture lint sealed where useful.

---

# Phase 4 — Integrations + Webhooks

**Status:** NOT STARTED

## P4.1 Provider adapters

Separate provider-specific behavior for:
- GitHub;
- Jira;
- Slack;
- Google;
- Microsoft/Teams;
- other existing providers.

Use Adapter/Strategy only where real interchangeability exists.

## P4.2 Token/credential storage

Ensure:
- encryption;
- no plaintext logging;
- no credential leakage;
- narrow storage ports.

## P4.3 External reliability

Define:
- timeouts;
- retries;
- circuit breaking;
- provider failure mapping;
- observability.

## P4.4 Webhook delivery

Define:
- delivery state;
- retry/backoff;
- job id/idempotency;
- signing;
- duplicate expectations;
- dead/failure behavior.

## P4.5 Inbound webhook validation

Validate provider signatures/authenticity where supported.

## P4 exit gate

- external SDK details isolated;
- retry/idempotency tests or verified design;
- secrets protected;
- provider outages do not break unrelated core flows.

---

# Phase 5 — AI + RAG

**Status:** NOT STARTED

## P5.1 Preserve AI provider abstraction

Do not replace a working strategy/provider abstraction simply for consistency.

## P5.2 AI persistence boundary

Move direct ORM usage out of application/guard/orchestration code where present.

## P5.3 Structured output validation

Every structured model output used as application data must be validated/narrowed.

## P5.4 RAG ingestion

Define:
- ownership/tenant scope;
- transaction boundaries;
- idempotent/repeatable ingestion;
- partial failure cleanup;
- document/segment repository ports.

## P5.5 RAG retrieval

Ensure:
- tenant filtering;
- permission filtering;
- no cross-tenant embeddings/context leak.

## P5 exit gate

- provider failures safe;
- persistence isolated;
- output validation enforced;
- tenant tests pass;
- ingestion retry semantics defined.

---

# Phase 6 — Secondary modules

**Status:** NOT STARTED

Domains:
- Resource Management;
- User Preferences;
- Onboarding;
- Gamification;
- Telemetry;
- remaining secondary modules discovered by audit.

Use the **lightest valid architecture**.

Do not apply complex CQRS to simple domains.

For each:
1. characterize;
2. isolate persistence/external infrastructure;
3. fix cycles;
4. narrow exports;
5. add boundary lint where valuable;
6. verify.

---

# Phase 7 — Type safety and architecture enforcement

**Status:** NOT STARTED

This phase happens after central migrations so strictness does not derail feature completion.

## P7.1 Production `any` reduction

- inventory `any`;
- eliminate high-risk architecture/security casts first;
- forbid new explicit `any` in production code;
- allow targeted temporary suppressions only with explanation.

## P7.2 TypeScript strictness

Increase strictness incrementally.

Possible sequence:
- `noImplicitAny`;
- `strictBindCallApply`;
- additional unsafe lint rules;
- eventually `strict` if feasible.

Each step must be its own bounded migration.

## P7.3 Architecture lint

Expand restrictions:
- no cross-module deep imports for sealed domains;
- no application-layer `@nestjs/typeorm`/`typeorm` imports in migrated modules;
- no concrete service imports across sealed boundaries.

## P7.4 Remove migration escape hatches

Only when no longer needed:
- remove unnecessary raw TypeORM exposure;
- remove transitional compatibility exports;
- remove obsolete adapters/comments.

---

# Phase 8 — Functional completeness audit

**Status:** NOT STARTED

Architecture completion does not imply product completion.

Repository-wide audit for:
- `TODO`;
- `FIXME`;
- `Not implemented`;
- fake success responses;
- sentinel values such as `-1`;
- empty catch blocks;
- swallowed errors;
- incomplete queue job IDs;
- disabled security checks;
- dead endpoint branches;
- unhandled provider paths.

Every finding must be classified:
- implement;
- remove;
- intentionally unsupported;
- defer with explicit reason.

No silent leftovers in critical production paths.

---

# Phase 9 — Production-readiness audit

**Status:** NOT STARTED

## P9.1 Database

- migrations reproducible;
- indexes reviewed against critical queries;
- connection pool settings reviewed;
- transaction isolation/locking hot paths reviewed;
- backup/restore documented.

## P9.2 Redis/BullMQ

- queue persistence;
- retry/backoff;
- dead/failure visibility;
- worker concurrency;
- graceful shutdown;
- multi-instance scheduling safety.

## P9.3 ClickHouse

- ingestion reliability;
- schema/migration strategy;
- retention;
- OLTP/OLAP ownership clarity.

## P9.4 Storage

- S3/MinIO permissions;
- signed URL behavior;
- upload limits;
- malware/content scan behavior;
- orphan cleanup.

## P9.5 Security

- auth/session/token revocation;
- tenant isolation;
- RBAC/CASL;
- CSRF;
- rate limiting;
- webhook verification;
- secrets;
- audit logs.

## P9.6 Observability

- Pino structured logs;
- correlation IDs;
- OpenTelemetry traces;
- metrics;
- queue metrics;
- health checks;
- alertable failure signals.

## P9.7 Load/performance

Measure:
- API latency;
- DB slow queries;
- search/report performance;
- WebSocket fanout;
- queue throughput;
- AI/provider latency.

Optimize measured bottlenecks.

Do not introduce microservices merely because load testing exposes a slow query.

---

# Phase 10 — Microservice decision checkpoint

**Status:** NOT STARTED

This is a decision checkpoint, not an automatic migration phase.

Evaluate only after production-like evidence exists.

For each candidate domain, score:
- independent scaling need;
- failure-isolation benefit;
- deployment independence;
- stable domain boundary;
- data ownership independence;
- distributed transaction pressure;
- operational readiness;
- measured bottleneck.

Possible candidates:
- AI/RAG execution;
- file processing;
- notifications/email;
- webhook delivery;
- integrations;
- search;
- analytics ingestion.

Project-management core remains together unless evidence strongly justifies decomposition.

Outcome may legitimately be:

`DECISION: remain modular monolith`

That is a successful architecture decision.

---

## 5. Standard milestone record template

Use this for each completed milestone.

```md
### <Milestone ID> — <Name>

Status: VERIFIED

Scope:
- ...

Changed:
- ...

Architecture decisions:
- ...

Verification:
- `npm run lint` — PASS
- `npm run build` — PASS
- `<relevant tests>` — PASS
- tenant isolation — PASS/N/A
- architecture boundary check — PASS

Residual debt:
- none / ...

Next:
- ...
```

---

## 6. Rules for changing this roadmap

- Do not mark status from memory.
- Do not rewrite history to make the project look cleaner.
- Keep discovered debt visible until resolved.
- Add new phases only when existing phases cannot logically contain the work.
- Prefer updating an existing milestone over creating dozens of tiny roadmap items.
- Verification evidence must be concrete.
- If code changes invalidate a prior status, downgrade it.

This roadmap is the durable hand-off state for the project.
