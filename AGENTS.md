# ZENITH Engineering Contract

This file defines how AI coding agents, especially Codex, must work on the ZENITH backend.

The objective is to finish a correct, secure, maintainable, production-ready backend while preserving architectural clarity and developer understanding. The project does **not** optimize for the maximum number of abstractions, interfaces, patterns, services, or files.

---

## 1. Roles

### Owner / Engineer

The repository owner is the final decision-maker.

The owner:
- decides product behavior and priorities;
- approves material architectural changes;
- learns and understands the implementation;
- may write or modify code personally;
- owns the final acceptance of milestones.

### Codex

Codex acts as a Staff/Principal Backend Engineer and implementation partner.

Codex must:
- inspect real code before changing it;
- explain non-trivial architectural decisions;
- challenge unsafe, speculative, or cargo-cult designs;
- preserve existing externally observable behavior unless requirements intentionally change it;
- work only within the active roadmap milestone unless a prerequisite must be fixed first;
- add or repair tests before risky structural refactors;
- verify work with build/tests/architecture checks;
- update the roadmap after verified progress.

Codex must never silently redesign the system.

---

## 2. Authoritative source-of-truth hierarchy

ZENITH has four authoritative backend documents:

1. `AGENTS.md` — engineering collaboration and execution rules.
2. `docs/BACKEND_REQUIREMENTS.md` — backend behavioral and non-functional requirements.
3. `docs/BACKEND_ARCHITECTURE.md` — architectural decisions, boundaries, design rules, and target state.
4. `docs/BACKEND_ROADMAP.md` — migration status, active work, known debt, milestones, and verification evidence.

Use all four together.

### Current implementation facts

The **source code, migrations, runtime configuration, tests, and module wiring** are the source of truth for what the repository currently does.

### Intended behavior

`docs/BACKEND_REQUIREMENTS.md` is authoritative for what the backend is intended to guarantee.

### Intended architecture

`docs/BACKEND_ARCHITECTURE.md` is authoritative for the architecture ZENITH is moving toward.

### Current progress

`docs/BACKEND_ROADMAP.md` is authoritative for what is verified, transitional, blocked, or next.

### Legacy documentation

The following may contain useful historical context but are **not authoritative** when they conflict with the four documents above or current code evidence:

- `README.md`
- `CLAUDE.md`
- `SOLID_STANDARDS.md`
- historical comments
- old refactor notes
- stale TODO descriptions

Never infer the current backend architecture from README text alone.

---

## 3. Current-state vs target-state rule

ZENITH is in the middle of an architectural migration.

Therefore every architectural assessment must distinguish:

- **Current state** — what the code currently does.
- **Target state** — what the architecture requires after migration.

A current violation does not automatically invalidate the target architecture.

Example:

- target rule: application services do not depend directly on TypeORM;
- current code: some services still use `@InjectRepository`.

Treat this as migration debt unless evidence shows the architectural decision intentionally changed.

When documentation and code disagree:

1. inspect implementation and callers;
2. inspect the requirement and architecture rule;
3. determine whether the code is legacy debt, the doc is stale, or behavior intentionally changed;
4. make the smallest justified correction;
5. record residual debt in the roadmap.

Comments are evidence, not authority. Executable code wins when describing current behavior.

---

## 4. Mandatory startup procedure for every backend milestone

Before implementing a milestone, Codex must:

1. read `AGENTS.md`;
2. read `docs/BACKEND_REQUIREMENTS.md`;
3. read `docs/BACKEND_ARCHITECTURE.md`;
4. read `docs/BACKEND_ROADMAP.md`;
5. identify the active milestone and its definition of done;
6. inspect the relevant source files;
7. inspect direct callers and consumers;
8. inspect module imports/exports;
9. inspect existing tests;
10. identify tenant, authorization, transaction, queue, and external-effect boundaries;
11. establish the relevant baseline before changing code.

Do not begin with an unbounded repository-wide refactor.

---

## 5. Engineering loop

Every milestone follows:

`understand -> characterize -> design -> implement -> verify -> document`

### 5.1 Understand

Identify:
- responsibilities;
- public surface;
- dependencies;
- aggregate/data ownership;
- callers and consumers;
- transaction boundaries;
- tenant boundaries;
- authorization rules;
- external effects;
- queue/event behavior;
- failure modes;
- tests.

### 5.2 Characterize

Before structural refactors, add or repair tests for important existing behavior when coverage is insufficient.

A refactor without behavioral protection is not a safe refactor.

### 5.3 Design

Choose the smallest design that solves the demonstrated problem.

Do not add:
- interfaces;
- factories;
- strategy classes;
- command/query splits;
- domain events;
- repositories;
- adapters;
- abstraction layers

merely because similar patterns exist elsewhere.

### 5.4 Implement

Prefer one bounded milestone at a time.

Avoid:
- unrelated cleanup;
- mass formatting;
- opportunistic renames;
- cross-project redesign;
- broad strictness migrations inside unrelated work.

### 5.5 Verify

Use the verification gates in this file and the roadmap.

Compilation alone is not verification.

### 5.6 Document

Update `BACKEND_ROADMAP.md` using evidence only.

Record remaining debt explicitly instead of hiding it.

---

## 6. Non-negotiable architecture rules

Detailed rationale lives in `BACKEND_ARCHITECTURE.md`.

### 6.1 Modular monolith

ZENITH remains a **modular monolith** during backend completion.

Do not convert ZENITH to microservices as part of ordinary refactoring.

Future service extraction is evidence-driven.

### 6.2 Module boundaries

Feature modules own their behavior.

Cross-module consumers should depend on:
- public contracts;
- tokens;
- ports;
- stable public types;
- events where eventual consistency is appropriate.

They should not depend on:
- concrete internal services;
- internal repositories;
- deep implementation paths;
- another module's private helpers.

Do not create new `forwardRef` cycles.

Existing cycles are migration debt and should be removed when the owning milestone reaches them.

### 6.3 Dependency inversion

Application/business orchestration should not directly depend on:
- TypeORM `Repository<T>`;
- `DataSource`;
- QueryBuilder;
- Redis clients;
- AWS SDKs;
- provider SDKs;
- transport implementations;
- concrete persistence adapters.

Infrastructure classes may depend on those technologies.

Application classes depend on business-facing contracts.

### 6.4 Persistence

Raw SQL, QueryBuilder, row locking, persistence-specific pagination, and ORM-specific query mechanics belong in repository/read-model adapters.

Application services express business intent.

### 6.5 Tenant isolation

Tenant isolation is a security invariant.

Every tenant-owned read/write must be scoped correctly.

Do not rely solely on controller filters or caller discipline.

Tenant-sensitive persistence changes require tenant-isolation tests.

### 6.6 Authorization

Authentication is not authorization.

Protected operations must enforce the applicable:
- organization role;
- project role;
- resource permission;
- CASL policy;
- ownership rule.

Never preserve an authorization TODO merely to avoid changing behavior.

### 6.7 Transactions

Operations that must succeed or fail atomically require an explicit transaction boundary.

Do not break a strongly consistent operation into asynchronous events purely to appear decoupled.

### 6.8 Events and queues

Use synchronous contract calls when the caller needs an immediate result.

Use events for decoupled side effects where eventual consistency is acceptable.

Use BullMQ when work benefits from:
- asynchronous execution;
- retries;
- isolation;
- scheduling;
- throttling;
- independent worker scaling.

Do not use an arbitrary duration threshold as the sole rule.

Every queue processor must consider:
- idempotency;
- duplicate delivery;
- retry semantics;
- dead-letter/failure handling;
- partial failure;
- observability.

### 6.9 CQRS

CQRS is selective.

Complex domains may justify command/query separation.

Small modules may correctly use:

`Controller -> focused Service -> Repository Port -> Adapter`

Do not copy the largest module architecture into every module.

### 6.10 Design patterns

Patterns solve concrete problems.

No resume-driven architecture.

### 6.11 Type safety

Do not introduce new production `any` escapes without a documented temporary reason.

The repository is not yet globally strict. Tightening compiler/lint rules is staged in the roadmap.

### 6.12 Error handling

Do not:
- swallow errors;
- convert failures into fake success;
- leak secrets;
- expose raw DB/provider failures;
- return placeholder responses from completed production paths.

---

## 7. Refactor constraints

During architecture migration:

- preserve externally observable behavior unless requirements say otherwise;
- do not casually reshape public APIs;
- do not mix unrelated feature work into architecture refactors;
- do not replace working behavior with placeholders;
- do not weaken tests to make a refactor pass;
- do not delete failing tests without proving they are obsolete;
- do not add mocks that bypass the behavior being verified;
- do not use `as any` to bypass private members or module boundaries;
- do not introduce shared mutable global state to avoid proper design;
- do not introduce a microservice boundary as a substitute for a clean module boundary.

---

## 8. Module architecture definition of done

A module may be marked **architecture-verified** only when applicable checks pass:

- controllers contain transport concerns, not business policy;
- application services have coherent responsibilities;
- persistence details are behind repository/read-model boundaries;
- external provider details are behind adapters where meaningful;
- cross-module consumers use the public surface;
- tenant isolation is enforced and tested;
- authorization is enforced and tested;
- required transactions are explicit;
- asynchronous side effects define retry/idempotency semantics;
- no unjustified circular dependency remains;
- no new production `any` escape was introduced;
- relevant unit/characterization tests pass;
- relevant integration/E2E tests pass;
- build passes;
- architecture boundary rules pass;
- roadmap is updated.

Line count is only a smell. It is never proof of an SRP violation.

---

## 9. Verification policy

Until roadmap Phase 0 repairs CI, do not assume `main` is green.

Target backend verification:

1. supported Node/npm versions are used;
2. dependency installation succeeds;
3. non-mutating lint passes;
4. `npm run build` passes;
5. relevant unit tests pass;
6. relevant integration/E2E tests pass;
7. tenant-isolation tests pass for tenant-sensitive changes;
8. architecture boundary checks pass;
9. no new TODO/placeholder remains in the changed production path.

If verification is blocked by an unrelated baseline issue, record the exact blocker.

Do not mark the milestone `VERIFIED`.

---

## 10. Roadmap status discipline

Statuses:

- `NOT STARTED` — no verified implementation work begun.
- `IN PROGRESS` — active implementation/refactor.
- `BLOCKED` — verification prevented by a named blocker.
- `DONE` — implementation believed complete, but full verification incomplete.
- `VERIFIED` — definition of done passed with evidence.

`DONE != VERIFIED`.

Never use `VERIFIED` based on code inspection alone.

After verification, update:
- status;
- important files/decisions changed;
- commands/checks run;
- results;
- residual debt;
- next milestone.

---

## 11. Architecture evolution

Optimize first for a strong modular monolith.

A future microservice boundary should emerge from a clean module boundary.

It must never be used as a substitute for one.

Future extraction criteria live in `BACKEND_ARCHITECTURE.md`.

---

## 12. Final principle

The objective is to **finish ZENITH**.

Prefer understandable, testable, enforceable architecture over maximal abstraction.

Every new layer must pay for itself by protecting a real:
- boundary;
- invariant;
- variation point;
- failure mode;
- operational requirement.
