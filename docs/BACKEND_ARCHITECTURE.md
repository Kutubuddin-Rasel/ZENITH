# ZENITH Backend Architecture

This document is the architectural constitution for the ZENITH backend.

It distinguishes **current reality** from **target architecture** so ongoing refactoring remains safe and evidence-driven.

---

## 1. Architectural direction

### Decision

ZENITH will remain a **modular monolith** during the current backend completion effort.

The architecture should be designed so selected domains can be extracted later if production evidence justifies independent services.

### Why

The backend is large, but codebase size is not a sufficient reason for microservices.

The project currently benefits strongly from:
- one transactional PostgreSQL boundary for connected project-management workflows;
- simple local calls between strongly related domains;
- one deployment/debugging model;
- low organizational overhead for a small engineering team;
- existing options for independent queue-worker and infrastructure scaling.

Premature service decomposition would introduce:
- network failure between formerly local calls;
- distributed transaction problems;
- eventual consistency;
- contract/version compatibility;
- duplicated data/read models;
- tracing complexity;
- deployment complexity;
- per-service secrets/configuration;
- more difficult integration testing.

The current bottleneck is architectural consistency and completion, not evidence of monolith saturation.

---

## 2. Current technology shape

The current backend uses, among other components:

- NestJS 11;
- TypeORM;
- PostgreSQL;
- Redis;
- BullMQ;
- ClickHouse;
- Socket.IO;
- CASL;
- S3-compatible storage;
- OpenTelemetry;
- provider integrations;
- AI/RAG components.

The root application imports a broad set of independent feature modules covering identity, project management, collaboration, analytics, integrations, AI, resource management, and real-time behavior.

This is a **modular monolith in migration**, not a simple CRUD monolith.

---

## 3. Target runtime topology

The target near-term topology is:

```text
                         Load Balancer
                               |
                +--------------+--------------+
                |              |              |
              API-1          API-2          API-N
                |              |              |
                +--------------+--------------+
                               |
            +------------------+-------------------+
            |                  |                   |
        PostgreSQL           Redis             ClickHouse
            |                  |
            |                BullMQ
            |                  |
            |          +-------+--------+
            |          |       |        |
            |       worker   worker   worker
            |
        S3 / MinIO
```

API processes and workers may scale independently while remaining part of the same codebase and architectural system.

A separate process is not automatically a microservice.

---

## 4. Internal architecture model

There is no requirement that every module contain every layer.

### Simple module

```text
Controller
    |
Application Service
    |
Repository/External Port
    |
Infrastructure Adapter
```

### Complex domain

```text
Controllers / Queue / Events
            |
      Application Layer
       /            \
  Commands          Queries
       \            /
     Policies / Ports
            |
       Infrastructure
```

Use complexity only where the domain requires it.

---

## 5. Layer responsibilities

### 5.1 Transport layer

Includes:
- controllers;
- WebSocket gateways;
- queue/event handlers when acting as entry points.

Responsibilities:
- input extraction;
- DTO/schema validation;
- identity/context extraction;
- invoking application capabilities;
- mapping output.

Must not own core business policy.

### 5.2 Application layer

Coordinates use cases.

Responsibilities:
- authorization orchestration;
- business workflow;
- transaction boundary intent;
- aggregate coordination;
- domain-policy invocation;
- event/queue scheduling decisions.

Must not contain persistence-specific queries.

### 5.3 Domain/policy layer

Where useful, contains:
- state-transition policy;
- specifications;
- calculators;
- invariant enforcement;
- pure decision logic.

Not every module needs explicit domain classes.

### 5.4 Infrastructure layer

Contains implementation-specific concerns:
- TypeORM;
- QueryBuilder/raw SQL;
- Redis;
- S3;
- ClickHouse;
- external provider SDKs;
- HTTP provider adapters;
- queue adapters;
- persistence locks.

---

## 6. Dependency rule

High-level business policy must not depend on low-level implementation details.

Preferred:

```text
ProjectCommandService
        |
TemplateApplicationPort
        |
TemplateApplicationAdapter
```

Avoid:

```text
ProjectCommandService
        |
ConcreteTemplateService
```

Preferred:

```text
SearchService
        |
GlobalSearchReadPort
        |
PostgresSearchReadModel
```

Avoid:

```text
SearchService
  |       |       |
IssueRepo ProjectRepo UserRepo
```

when the real need is one cross-aggregate read model.

---

## 7. Module ownership

Every feature module should have a clear owner boundary.

A module owns:
- its internal business logic;
- its stable public contracts;
- its persistence semantics where practical;
- its events/ports;
- its tests.

Other modules should not reach into its internals.

---

## 8. Public module surfaces

Mature modules should expose a deliberately small public surface through:
- `index.ts` barrel;
- tokens;
- interfaces/contracts;
- stable view/result types;
- outbound ports where necessary;
- module class for NestJS wiring.

Concrete services, repositories, controllers, mappers, and adapters should normally remain private.

Important boundaries should be enforced with ESLint/import rules.

---

## 9. Persistence architecture

### Target rule

Application services do not directly use:
- `@InjectRepository`;
- `Repository<T>`;
- `DataSource`;
- QueryBuilder;
- raw SQL.

Those belong in infrastructure.

### Current state

The migration is incomplete.

Mature domains already use abstract repositories/ports and adapters.

Other domains still directly inject TypeORM. These are roadmap debt and must not be copied into newly refactored modules.

### Repository scope

Use repositories for aggregate-focused persistence behavior.

Do not create one generic repository abstraction that leaks ORM semantics everywhere.

### Read models

Complex cross-aggregate queries may use purpose-built read-model ports.

Search, reports, dashboards, and analytics are especially appropriate for this pattern.

---

## 10. Tenant isolation architecture

Tenant isolation is a persistence/security invariant.

Preferred:

```text
Application
    |
Tenant-aware repository/read model contract
    |
Adapter enforces tenant scope
```

Avoid relying on:

```text
Controller adds tenantId sometimes
```

Tenant context may be available globally, but repositories/read models must still make scope explicit enough to review and test.

---

## 11. Authorization architecture

Authorization may use:
- CASL abilities;
- project/organization membership queries;
- explicit policies/specifications;
- guards for coarse transport admission.

Guards should not perform complex business mutation.

Fine-grained business authorization belongs close to the use case.

A controller must not interpret “authenticated” as “allowed.”

---

## 12. Transactions

Transactions belong around business consistency boundaries.

Examples:
- project initialization from template;
- issue-key/counter allocation;
- multi-table workflow mutation;
- operations that update ordering plus ownership/state.

Row locks and TypeORM transaction mechanics belong in persistence adapters.

Application services should request an atomic operation without knowing unnecessary ORM details.

---

## 13. CQRS policy

ZENITH uses **selective CQRS**, not universal CQRS.

Use separate command/query capabilities when:
- read and write responsibilities differ materially;
- a service has become an orchestration god class;
- read models diverge from write models;
- public capabilities benefit from ISP separation.

Do not split a tiny cohesive service just to match Issues/Projects.

---

## 14. Design pattern policy

Patterns are selected by problem.

| Problem | Preferred tool |
|---|---|
| Persistence isolation | Repository / Adapter |
| Cross-module dependency | Port / public contract |
| Cross-aggregate read | Read-model / Query Object |
| Complex mutation surface | Command capability |
| Complex read surface | Query capability |
| Workflow transition rules | Policy / state-machine model |
| Multiple AI providers | Strategy + provider registry/factory |
| External integrations | Adapter / Strategy |
| Decoupled side effects | Domain/application events |
| Long-running/retry work | BullMQ producer/consumer |
| Unreliable external provider | Timeout + retry + circuit breaker |
| Authorization decisions | Policy / Specification |
| Storage/cache alternatives | Adapter / Strategy |

A design pattern is not justified by its name.

---

## 15. Event policy

Events are appropriate when:
- consumers are secondary side effects;
- eventual consistency is acceptable;
- the producer should not know every consumer.

Examples:
- notifications;
- audit/analytics side effects;
- some integration propagation.

Do not use events for operations that require one atomic synchronous consistency boundary.

---

## 16. Queue policy

BullMQ is appropriate for:
- retryable external work;
- file processing;
- report generation;
- email;
- webhook delivery;
- scheduled work;
- AI jobs;
- workloads that need independent concurrency/scaling.

Queue design must specify:
- job identity;
- idempotency;
- retry strategy;
- timeout;
- backoff;
- failure state;
- observability.

Do not queue work merely because it takes “more than N milliseconds.”

---

## 17. External integration architecture

Provider-specific code belongs behind adapters.

Preferred:

```text
IntegrationUseCase
      |
ProviderPort
      |
+-----+------+------+
|            |      |
GitHub      Jira   Slack
```

Provider failure must not destabilize unrelated core functions.

Use bounded retries and circuit breakers where justified.

---

## 18. AI architecture

Preserve the existing provider abstraction where it represents true interchangeability.

Separate:
- provider transport;
- prompt/model invocation;
- output validation;
- business decision/application.

Structured AI output must be validated before becoming trusted application state.

Do not let AI provider SDK types become domain contracts.

---

## 19. Search architecture

Global search is a cross-aggregate read concern.

Target architecture:

```text
SearchController
      |
SearchApplicationService
      |
GlobalSearchReadPort
      |
Postgres/OpenSearch Read Adapter
```

This avoids coupling the search application service to many aggregate repositories.

Search must enforce tenant and visibility boundaries inside the read model.

---

## 20. Analytics/reporting architecture

Transactional writes remain in PostgreSQL.

Read-heavy analytics may use:
- ClickHouse;
- materialized projections;
- purpose-built read models.

Do not move transactional source-of-truth semantics into ClickHouse.

Reports should consume stable read models rather than tightly coupling formatting code to ORM queries.

---

## 21. Type-safety strategy

Current compiler configuration is not fully strict.

Target:
- no new `any`;
- prefer `unknown` and narrowing;
- precise external-response validation;
- stronger compiler/lint rules over time.

Migration must be incremental.

Do not turn on full TypeScript strictness in a refactor if it causes unrelated project-wide churn.

---

## 22. Circular dependency policy

New circular module/service dependencies are prohibited.

Existing `forwardRef` is migration debt.

Preferred resolution order:
1. clarify ownership;
2. introduce narrow consumer-owned or capability-owner contracts;
3. invert the dependency;
4. use events when the dependency is truly asynchronous;
5. split responsibilities only if the boundary is real.

Do not create an artificial shared “god module” to hide cycles.

---

## 23. Microservices decision

### AD-001 — Remain a modular monolith

**Status:** Accepted.

ZENITH remains a modular monolith during backend completion.

### What does not justify extraction

None of these is sufficient:
- many files;
- a large NestJS module;
- hypothetical future traffic;
- desire to appear enterprise;
- another company using microservices.

### Extraction criteria

A module becomes a serious microservice candidate when several of these are true:

1. **Independent scaling**
   - workload needs materially different CPU/memory/concurrency scaling.

2. **Failure isolation**
   - provider or workload failures should not affect the core API.

3. **Independent deployment**
   - the domain changes/releases independently at meaningful frequency.

4. **Stable domain boundary**
   - ownership and contracts are mature.

5. **Independent data ownership**
   - the service can own data without constant cross-service joins/transactions.

6. **Low distributed-transaction pressure**
   - most workflows do not require atomic cross-boundary changes.

7. **Operational maturity**
   - tracing, metrics, deployments, secrets, alerting, and CI are strong enough.

8. **Measured production need**
   - actual evidence shows the monolith/runtime topology is insufficient.

### Likely future extraction candidates

Potential future candidates, if evidence supports them:
- AI/RAG execution;
- file-processing workers;
- notifications/email;
- webhook delivery;
- external integrations;
- search;
- analytics ingestion.

### Domains that should remain together longer

The project-management transactional core should not be split prematurely:
- projects;
- issues;
- boards;
- sprints;
- backlog;
- workflows;
- taxonomy;
- watchers.

These domains have strong consistency and relationship pressure.

---

## 24. Evolution strategy

Future extraction follows:

```text
Clean module boundary
        |
Observed production pressure
        |
Extraction decision
        |
Strangler/evolutionary migration
```

Never:

```text
Messy module
   |
“microservices will fix it”
```

---

## 25. Current architectural reality

The repository already contains mature examples of the intended direction.

### Stronger/more mature areas

Existing architecture work shows useful patterns in areas such as:
- Issues;
- Boards;
- Sprints;
- Backlog;
- Comments;
- Attachments;
- Releases;
- Analytics;
- Reports;
- Notifications;
- Email;
- parts of Projects;
- Invites/API keys/RBAC-style sealed boundaries.

These are references for principles, not templates to copy mechanically.

### Transitional areas

Known migration areas include:
- Workflows;
- Projects;
- Project Templates;
- Search;
- Taxonomy;
- Watchers;
- Revisions;
- Integrations;
- Webhooks;
- AI/RAG persistence boundaries;
- Resource Management;
- User Preferences;
- Onboarding;
- Gamification;
- Telemetry.

The roadmap determines sequencing.

---

## 26. Architecture decisions

### AD-001 — Modular monolith
Accepted. See section 23.

### AD-002 — PostgreSQL is transactional source of truth
Accepted.

### AD-003 — ClickHouse is for analytical workloads
Accepted.

### AD-004 — Redis is infrastructure
Accepted. Redis should not become an accidental domain source of truth unless explicitly designed.

### AD-005 — CQRS is selective
Accepted.

### AD-006 — Module APIs are narrow
Accepted. Other modules consume contracts/tokens/ports rather than concrete internals.

### AD-007 — Persistence details stay behind boundaries
Accepted as target state; migration incomplete.

### AD-008 — Microservice extraction is evidence-driven
Accepted.

### AD-009 — Architecture rules should become executable
Accepted. Important boundaries should be enforced by lint/tests.

### AD-010 — Completion beats maximal abstraction
Accepted.

---

## 27. Architecture review questions

Before approving a non-trivial backend design, ask:

1. Which module owns this capability?
2. Which data does it own?
3. Is tenant scope explicit?
4. Where is authorization enforced?
5. What must be atomic?
6. What may be eventually consistent?
7. Is a new dependency synchronous or asynchronous?
8. Does the caller need a public contract or is a local function sufficient?
9. Does this abstraction hide a technology or protect a real business boundary?
10. What happens on retry?
11. What happens on partial failure?
12. How is this tested?
13. How is this observed in production?
14. Does this introduce a circular dependency?
15. Would this make future extraction easier because the boundary is cleaner—or harder because it adds distributed coupling?

If these cannot be answered, the design is not ready.
