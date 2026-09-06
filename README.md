<div align="center">

# ⚡ Zenith

**The Enterprise-Grade Project Management SaaS**

*Manage projects, track issues, and leverage AI to build better software — faster.*

[![Build Status](https://img.shields.io/github/actions/workflow/status/Kutubuddin-Rasel/ZENITH/ci.yml?style=for-the-badge&logo=githubactions)](https://github.com/Kutubuddin-Rasel/ZENITH/actions)
[![Backend](https://img.shields.io/badge/Backend-NestJS%2011-E0234E?style=for-the-badge&logo=nestjs)](https://nestjs.com/)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js%2015-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%2017-336791?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-UNLICENSED-red?style=for-the-badge)](#license)
[![Node](https://img.shields.io/badge/Node.js-22.x-brightgreen?style=for-the-badge&logo=node.js)](https://nodejs.org/)

</div>

---

## Overview

**Zenith** is a full-stack, open-source project management platform built to compete with Jira and Linear. It is designed for software engineering teams that need enterprise-grade project tracking fused with **real AI intelligence** — not just cosmetic AI features.

At its core, Zenith provides:

- **"Ask Your Project" (RAG)** — Natural language queries over your entire backlog using embeddings stored in PostgreSQL `pgvector`. Ask *"What is blocking the mobile app release?"* and get a sourced answer.
- **Intelligent Smart Setup** — A conversational AI wizard that extracts your project's methodology, team size, and workflow from plain English and auto-configures the entire board.
- **Real-time Kanban / Scrum** — WebSocket-powered boards where every drag, create, and delete is broadcast instantly to all connected clients using Socket.IO backed by a Redis adapter.
- **Complete Enterprise SaaS** — Multi-tenant workspaces, RBAC with CASL, Stripe billing, SAML/SSO, Two-Factor Authentication (TOTP), ClickHouse-backed audit logs, and a Prometheus + Grafana observability stack.

---

## Feature Catalogue

### 🤖 Zenith Intelligence (AI Layer)

| Feature | Description |
|---|---|
| **Ask Your Project (RAG)** | Semantic search over issues using `pgvector` + OpenAI embeddings. Conversation history is stored in Redis (TTL: 1h). Multi-turn context aware. |
| **Smart Setup Wizard** | Conversational AI project configurator. `SemanticExtractorService` parses intent; `ConversationManagerService` tracks the dialogue; `TemplateScorerService` ranks project templates by confidence. |
| **Duplicate Detection** | Identifies semantically similar issues before creation to reduce backlog noise. |
| **Predictive Analytics** | Sprint risk analysis and AI-scored template recommendations via `PredictionAnalyticsService`. |
| **AI-generated Names** | `ProjectNameGeneratorService` generates creative project names from a user description. |
| **PII Sanitization** | All data passed to LLMs is scrubbed by `PiiSanitizerService` before leaving the system. |
| **Cost Guard** | `AiCostGuardService` enforces per-request token budgets and circuit-breaking for LLM calls. |
| **Cohere Reranker** | Optional Cohere reranking pass on semantic search results for higher precision RAG responses. |

### 📋 Project & Issue Management

- **Issue Hierarchy**: Epic → Story → Task → Sub-task, with parent/child relationships via self-referential FK.
- **LexoRank Ordering**: O(1) drag-and-drop reorder using a lexicographic rank string (`0|HZZZZZ:` format) — the same algorithm Jira uses.
- **Optimistic Locking**: `@VersionColumn()` on the `Issue` entity detects concurrent edits. The global `OptimisticLockingInterceptor` returns `409 Conflict` with conflict resolution data.
- **Custom Fields**: Per-project configurable field definitions (text, number, date, select) applied to issues.
- **Labels & Taxonomy**: Hierarchical label taxonomy system with CRUD management.
- **Flexible Workflows**: Custom workflow states with configurable transition rules managed by `WorkflowDesigner`.
- **Backlog Management**: Scrum backlog with sprint assignment, ordering, and bulk operations.
- **Sprints**: Full lifecycle (create → start → complete → archive) with velocity tracking and a scheduled auto-completion cron.
- **Releases**: Version milestone tracking with issue linkage and release notes.
- **Watchers**: Subscribe to issue updates. Notifications fired via event emitter.
- **Revisions**: Full edit history on issues (what changed, who changed it, when).
- **Time Tracking**: Work logs with minutes spent and notes.
- **Import**: Migrate issues from Jira (XML) and Trello (JSON) via dedicated import controllers.
- **Export**: Export issue lists to Excel (via `exceljs`) and PDF (via `pdfkit`).

### 🏢 Enterprise SaaS Platform

- **Multi-Tenancy**: Every database query is scoped by `TenantContext` (CLS-based request-scoped service). Tenant ID is extracted from JWT and stored in async-local-storage. Bypass operations are **audited** (SOC 2 compliance).
- **Organizations & Workspaces**: Slug-based URL routing. Each organization is a fully isolated tenant.
- **Role-Based Access Control (RBAC)**: Hierarchical roles (Owner → Admin → Member → Guest). `RBACModule` + CASL `@casl/ability` for attribute-based permission checks at the service level.
- **Billing**: Stripe integration with subscription management, usage-based billing, and webhook handling (raw body preserved for signature verification).
- **API Keys**: Scoped API key management for programmatic access.
- **Webhooks**: Outbound webhook delivery to external systems.
- **SAML/SSO**: `@node-saml/passport-saml` integration for enterprise identity providers.
- **2FA (TOTP)**: Full TOTP setup/verify/recovery-code flow with QR code generation via `speakeasy` + `qrcode`.
- **Session Management**: Concurrent session limits, session listing, and remote revocation.
- **Password Policy**: Configurable minimum length (default: 12), complexity enforcement, and `zxcvbn` strength scoring.

### 🔌 Integrations

| Integration | Capabilities |
|---|---|
| **GitHub OAuth** | Issue-to-PR linking, PR status sync |
| **GitHub App** | Webhook-driven PR updates (verified signature) |
| **Slack** | OAuth install, incoming webhooks, direct notifications, slash commands bridge |
| **Jira** | OAuth 2.0, issue import |
| **Trello** | API import |
| **Google Workspace** | OAuth integration |
| **Microsoft Teams** | OAuth + notifications bridge |
| **Intercom** | Customer support bridge |

### 🔴 Real-Time Collaboration

- **Board Gateway** (`/boards` Socket.IO namespace): All Kanban events (issue moved, created, updated, deleted, reordered, columns reordered) are broadcast to all clients joined to the same `boardId` room.
- **Redis WebSocket Adapter**: Horizontal scaling — multiple backend instances share the same Socket.IO event bus via `@socket.io/redis-adapter`.
- **Notifications Gateway**: Real-time in-app notification delivery over a dedicated Socket.IO namespace.
- **Conflict Modal**: When two users edit the same issue simultaneously, the frontend's `ConflictModal` presents a diff and resolution options.

### 📊 Analytics & Observability

- **Audit Logs**: ClickHouse-backed audit trail (`MergeTree` engine, partitioned by month). Captures actor, IP, resource type, resource ID, action type, and diffs. Accessed via `AuditDashboard`.
- **ClickHouse Schema**: `audit_logs(event_uuid, timestamp, tenant_id, actor_id, actor_ip, resource_type, resource_id, action_type, changes, metadata)`.
- **Prometheus Metrics**: `prom-client` exposes `GET /metrics`. HTTP request duration histograms via `HttpMetricsMiddleware`.
- **Grafana**: Pre-provisioned dashboards mounted from `backend/grafana/provisioning`.
- **OpenTelemetry**: Full distributed tracing via `@opentelemetry/auto-instrumentations-node` and OTLP exporter.
- **Pino Logging**: Structured JSON logging (`nestjs-pino`) with correlation IDs injected by `CorrelationMiddleware`.
- **Health Check**: `GET /health` via `@nestjs/terminus` for Docker healthcheck probes.
- **Performance Dashboard**: Frontend `PerformanceDashboard` component with live metrics visualization.

### 🎮 Gamification

- **XP & Leaderboard**: Users earn XP for completing sprints, creating issues, resolving bugs, and other actions. Redis sorted sets (`ZADD`) power the real-time XP leaderboard.
- **Achievements**: Seeded badge system (`first-sprint`, `first-issue`, `bug-hunter`, `early-bird`, etc.) with progress tracking.

### 🔐 Security

- **Helmet**: Strict CSP headers, HSTS (`max-age=31536000; includeSubDomains; preload`), X-Frame-Options.
- **CSRF Protection**: Per-request nonce generation in Next.js `middleware.ts`. `CsrfModule` on the backend.
- **Rate Limiting**: Redis-backed throttler via `@nestjs/throttler` + `@nest-lab/throttler-storage-redis`. Per-endpoint limits (global, login, register, 2FA, password reset).
- **Circuit Breaker**: `opossum`-based circuit breaker for all external API calls (threshold: 5 failures / 30s reset).
- **Argon2 / bcrypt**: Password hashing with `argon2` (primary) and `bcryptjs` (legacy compatibility).
- **Field Encryption**: Sensitive fields at-rest encrypted via `crypto-js` (`FIELD_ENCRYPTION_KEY`).
- **File Uploads**: `clamscan` antivirus scanning + `file-type` MIME validation + `sanitize-filename` on all uploads.
- **Input Sanitization**: `sanitize-html` on all rich-text inputs; `escape-html` on plain-text fields.

---

## Technology Stack

### Backend

| Category | Technology | Version |
|---|---|---|
| Framework | NestJS | `11.x` |
| Language | TypeScript | `5.8.3` |
| Runtime | Node.js | `22.x` |
| ORM | TypeORM | `0.3.24` |
| Primary DB | PostgreSQL (pgvector) | `17` |
| Cache / Queues | Redis (ioredis) | `7.4` |
| Job Queues | BullMQ | `5.x` |
| Analytics DB | ClickHouse | `24.12` |
| Object Storage | AWS S3 / MinIO | — |
| Auth | Passport.js (JWT, Local, SAML) | — |
| Permissions | CASL (`@casl/ability`) | `6.7` |
| Real-time | Socket.IO | `4.x` |
| AI / LLM | OpenAI SDK, Google Gemini | — |
| Embeddings | pgvector + OpenAI | — |
| Email | Resend | `6.x` |
| Billing | Stripe | `20.x` |
| Logging | Pino (nestjs-pino) | — |
| Observability | OpenTelemetry, Prometheus, Grafana | — |
| API Docs | Swagger / OpenAPI | — |

### Frontend

| Category | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | `15.5.x` |
| Language | TypeScript | `5.x` |
| Styling | Tailwind CSS | `3.4.x` |
| Animation | Framer Motion | `12.x` |
| State (Server) | TanStack Query v5 | `5.x` |
| State (Client) | Zustand | `5.x` |
| Drag & Drop | dnd-kit | `6.x` |
| Virtualization | TanStack Virtual | `3.x` |
| Charts | Recharts | `2.x` |
| Flow Diagrams | React Flow | `11.x` |
| Forms | React Hook Form + Zod | — |
| Smooth Scroll | Lenis | `1.x` |
| Toasts | Sonner | `2.x` |
| Icons | Lucide React | — |

### Infrastructure

| Component | Technology |
|---|---|
| Containerization | Docker + Docker Compose |
| Reverse Proxy | Nginx (production) |
| CI/CD | GitHub Actions |
| Dev Object Storage | MinIO (S3-compatible) |
| Prod Object Storage | AWS S3 |

---

## Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Nginx (Prod Gateway)                          │
│                     Ports 80 (HTTP) / 443 (HTTPS)                     │
└───────────┬────────────────────────────────────────┬───────────────────┘
            │ /api/*                                 │ /*
            ▼                                        ▼
┌────────────────────────┐               ┌────────────────────────────┐
│   NestJS API (4000)    │               │   Next.js Frontend (3001)  │
│                        │               │   App Router + Middleware   │
│  ┌──────────────────┐  │               │                            │
│  │ Global Middleware│  │               │  TanStack Query (server)   │
│  │  - Helmet / CSP  │  │               │  Zustand (client state)    │
│  │  - Compression   │  │               │  Framer Motion animations  │
│  │  - Correlation ID│  │               │  dnd-kit drag & drop       │
│  │  - HTTP Metrics  │  │               └────────────────────────────┘
│  └──────────────────┘  │
│  ┌──────────────────┐  │               ┌────────────────────────────┐
│  │ Global Pipes     │  │               │   Socket.IO (WS)           │
│  │ ValidationPipe   │  │◄──────────────│   /boards namespace        │
│  └──────────────────┘  │               │   /notifications namespace │
│  ┌──────────────────┐  │               └────────────────────────────┘
│  │ Global Guards    │  │
│  │ ThrottlerGuard   │  │
│  └──────────────────┘  │
│  ┌──────────────────┐  │
│  │Global Interceptor│  │
│  │TenantInterceptor │  │  ← Injects organizationId into CLS from JWT
│  │TimingInterceptor │  │
│  └──────────────────┘  │
└────────────┬───────────┘
             │
   ┌─────────┼─────────────────────────────┐
   ▼         ▼                             ▼
┌──────┐ ┌───────┐  ┌──────────────┐  ┌──────────┐
│ PG17 │ │ Redis │  │  ClickHouse  │  │  MinIO/  │
│+pgvec│ │ 7.4   │  │  24.12       │  │   S3     │
│      │ │       │  │ (Audit Logs) │  │(Storage) │
└──────┘ └───────┘  └──────────────┘  └──────────┘
```

### Backend Module Architecture

The NestJS app is organized into four layers, loaded in strict dependency order:

```
Layer 1 — Core Infrastructure (loaded first)
  ConfigModule, DatabaseModule (TypeORM), CacheModule,
  ThrottlerModule (Redis-backed), HealthModule, MetricsModule

Layer 2 — Core Domain (global providers)
  CoreEntitiesModule, UsersCoreModule, AuthCoreModule,
  TenantModule, CircuitBreakerModule, CoreQueueModule

Layer 3 — Shared / Security (cross-cutting)
  CommonModule, EncryptionModule, SessionModule,
  CsrfModule, CaslModule, RBACModule, AuditLogsModule, TelemetryModule

Layer 4 — Feature Domains (business logic)
  Identity & Access: OrganizationsModule, UsersModule, AuthModule,
                     InvitesModule, MembershipModule, ApiKeysModule
  Project Mgmt:      ProjectsModule, IssuesModule, SprintsModule,
                     BacklogModule, BoardsModule, ReleasesModule,
                     WorkflowsModule, CustomFieldsModule
  Collaboration:     CommentsModule, AttachmentsModule, WatchersModule,
                     RevisionsModule, NotificationsModule
  Analytics:         ReportsModule, AnalyticsModule, DashboardModule
  AI & RAG:          AiModule, RagModule
  Integrations:      IntegrationsModule, WebhooksModule
  Billing:           BillingModule
  Real-time:         GatewaysModule (Socket.IO)
```

### Multi-Tenancy Model

Every request goes through the `TenantInterceptor` (global), which:
1. Reads the JWT from the `Authorization` header
2. Extracts `organizationId` from the JWT payload
3. Stores it in **CLS** (Continuation-Local Storage via `nestjs-cls`)

All services inherit from `TenantRepository`, which automatically appends `WHERE organization_id = :tenantId` to every TypeORM query. Bypass operations require an explicit reason and are written to the audit log with `HIGH` severity for SOC 2 compliance.

### AI / RAG Architecture

```
User Question
     │
     ▼
PiiSanitizerService     ← Scrub PII before sending to LLM
     │
     ▼
EmbeddingsService       ← OpenAI text-embedding-* model → float[1536]
     │
     ▼
SemanticSearchService   ← pgvector cosine similarity query
     │                    WHERE org_id = :tenant AND similarity > 0.5
     ▼ (top-10 issues)
CohereRerankerService   ← Optional reranking pass
     │
     ▼
ProjectRAGService       ← Build prompt with issue context (max 3500 tokens)
     │                    Prepend conversation history from Redis (LRANGE)
     ▼
AIProviderService       ← OpenAI / Gemini / Groq (configurable)
     │
     ▼
Answer + Sources        ← streamed back to client
```

Conversation history is stored in Redis as a list (`RPUSH` for atomic appends). TTL: 1 hour. Graceful degradation: if Redis is unavailable, the RAG proceeds in single-turn mode.

### Kanban Real-Time Flow

```
Client Drags Issue
      │
      │ HTTP PATCH /issues/:id (LexoRank + statusId update)
      ▼
IssuesService (optimistic update, VersionColumn guard)
      │
      │ EventEmitter2.emit('issue.moved', payload)
      ▼
BoardGateway.onIssueMoved()
      │
      │ io.to(boardId).emit('issue:moved', slimPayload)
      ▼
All Clients in Board Room
      │
      │ useBoardSocket hook → queryClient.setQueryData() (cache patch)
      ▼
Instant UI Update (no full refetch)
```

---

## Project Structure

```
Zenith/
├── docker-compose.yml          # Development stack (7 services)
├── docker-compose.prod.yml     # Production stack (Nginx + all services)
├── nginx/                      # Nginx config + SSL generation script
├── docs/                       # Architecture, audit, frontend, plan docs
├── CLAUDE.md                   # Agent persona & engineering protocols
├── SOLID_STANDARDS.md          # Strict SOLID enforcement rules
│
├── backend/                    # NestJS API
│   ├── src/
│   │   ├── main.ts             # Bootstrap: Helmet, CORS, Swagger, HTTPS, WebSocket adapter
│   │   ├── app.module.ts       # Root module — 4-layer import ordering
│   │   ├── instrumentation.ts  # OpenTelemetry SDK initialization (runs before app)
│   │   │
│   │   ├── core/               # Infrastructure foundations
│   │   │   ├── tenant/         # TenantContext (CLS), TenantRepository, bypass audit
│   │   │   ├── auth/           # JWT strategies (access + refresh)
│   │   │   └── entities/       # Shared base entities
│   │   │
│   │   ├── ai/                 # Zenith Intelligence module
│   │   │   └── services/
│   │   │       ├── project-intelligence.service.ts  # Smart Setup orchestrator
│   │   │       ├── project-rag.service.ts           # Ask Your Project (RAG)
│   │   │       ├── semantic-search.service.ts        # pgvector cosine similarity
│   │   │       ├── conversation-manager.service.ts   # Redis-backed dialogue
│   │   │       ├── ai-provider.service.ts            # OpenAI / Gemini / Groq router
│   │   │       ├── ai-cost-guard.service.ts          # Token budget enforcement
│   │   │       ├── pii-sanitizer.service.ts          # PII scrubbing before LLM
│   │   │       ├── cohere-reranker.service.ts        # Reranking pass (optional)
│   │   │       ├── prediction-analytics.service.ts   # Sprint risk, template scores
│   │   │       └── duplicate-detection.service.ts    # Semantic duplicate finder
│   │   │
│   │   ├── auth/               # Authentication (JWT, Local, SAML, 2FA, sessions)
│   │   ├── billing/            # Stripe subscriptions, usage tracking
│   │   ├── organizations/      # Workspace / tenant management
│   │   ├── projects/           # Project CRUD + security policies
│   │   ├── issues/             # Core issue management (LexoRank, optimistic lock)
│   │   ├── sprints/            # Sprint lifecycle + auto-completion cron
│   │   ├── boards/             # Kanban board configuration
│   │   ├── workflows/          # Custom workflow state machines
│   │   ├── gateways/           # Socket.IO board + notifications gateways
│   │   ├── rag/                # RAG ingestion and retrieval services
│   │   ├── analytics/          # ClickHouse analytics events + alerting
│   │   ├── audit/              # Audit log service + ClickHouse client
│   │   ├── gamification/       # XP, achievements, Redis leaderboard
│   │   ├── integrations/       # GitHub, Slack, Jira, Trello, Google, Teams
│   │   ├── notifications/      # Event-driven email + in-app notifications (Resend)
│   │   ├── search/             # Full-text + semantic cross-project search
│   │   ├── rbac/               # Role and permission management
│   │   ├── custom-fields/      # Per-project custom field definitions
│   │   ├── resource-management/# Capacity planning and resource allocation
│   │   ├── observability/      # OpenTelemetry spans and metrics
│   │   ├── metrics/            # Prometheus HTTP metrics middleware
│   │   ├── security/           # CSRF protection module
│   │   ├── encryption/         # Field encryption + HTTPS config
│   │   └── common/             # Shared interceptors, filters, middleware, decorators
│   │
│   ├── prometheus.yml          # Prometheus scrape config
│   ├── grafana/                # Grafana provisioned dashboards
│   └── .env.example            # Full annotated environment variable reference
│
└── frontend/                   # Next.js 15 App Router
    ├── middleware.ts            # CSP nonce generation + security headers
    ├── src/
    │   ├── app/
    │   │   ├── (app)/          # Authenticated app shell
    │   │   │   ├── integrations/  # Integration hub pages
    │   │   │   └── notifications/ # Notification center
    │   │   ├── auth/           # Login, register, 2FA, SAML callback
    │   │   ├── projects/       # Project pages (board, backlog, sprints, releases)
    │   │   ├── settings/       # Workspace and user settings
    │   │   └── api/            # Next.js API routes (proxy layer)
    │   ├── components/
    │   │   ├── Issue/          # Issue detail panel, inline editing
    │   │   ├── Sprint/         # Sprint modals and management
    │   │   ├── WorkflowDesigner/ # Visual workflow state editor
    │   │   ├── IntegrationHub/ # OAuth connect flows for all integrations
    │   │   ├── ProjectWizard/  # AI-powered Smart Setup wizard UI
    │   │   ├── ResourceManagement/ # Capacity planning UI
    │   │   ├── analytics/      # Charts and analytics components
    │   │   ├── chat/           # RAG "Ask Your Project" chat interface
    │   │   └── animations/     # Framer Motion shared animation variants
    │   ├── hooks/              # 46 TanStack Query hooks (one per domain)
    │   │   ├── useZenithDrag.ts    # Unified dnd-kit drag engine
    │   │   ├── useBoardSocket.ts   # Socket.IO real-time board hook
    │   │   └── useProjectIssues.ts # Issue CRUD + filtering
    │   ├── stores/             # Zustand stores (useIssuesStore)
    │   ├── context/            # AuthContext, ToastContext
    │   └── lib/                # API client config, utilities
```

---

## Getting Started

### Prerequisites

| Tool | Version |
|---|---|
| Docker | 24+ |
| Docker Compose | v2.x |
| Node.js | 22.x (for local dev) |
| npm | 10.x |

### Quick Start (Docker — Recommended)

> [!IMPORTANT]
> The full dev stack runs as 7 Docker services. One command launches everything.

**1. Clone the repository**

```bash
git clone https://github.com/Kutubuddin-Rasel/ZENITH.git
cd ZENITH
```

**2. Configure environment**

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set the required values:

```env
# [REQUIRED] Authentication secrets
JWT_SECRET=<generate: openssl rand -base64 32>
JWT_REFRESH_SECRET=<generate: openssl rand -base64 32>

# [REQUIRED] At least one AI provider for RAG features
OPENAI_API_KEY=sk-...

# [OPTIONAL] Integrations — leave blank to disable
GITHUB_CLIENT_ID=
STRIPE_SECRET_KEY=
SLACK_CLIENT_ID=
```

**3. Launch the full stack**

```bash
docker compose up -d
```

This starts:
- `zenith_db` — PostgreSQL 17 with pgvector
- `zenith_redis` — Redis 7.4
- `zenith_clickhouse` — ClickHouse 24.12
- `zenith_minio` — S3-compatible object storage
- `zenith_api` — NestJS backend
- `zenith_frontend` — Next.js frontend
- `zenith_prometheus` + `zenith_grafana` — Observability

**4. Access the services**

| Service | URL |
|---|---|
| **Frontend** | http://localhost:3001 |
| **API** | http://localhost:3000 |
| **Swagger / API Docs** | http://localhost:3000/api/docs |
| **MinIO Console** | http://localhost:9001 |
| **Prometheus** | http://localhost:9090 |
| **Grafana** | http://localhost:3002 (admin/admin) |

**5. Create the first admin user**

```bash
cd backend
npm run create-admin
```

---

### Local Development (No Docker)

**Backend**

```bash
cd backend
npm install
npm run start:dev      # Hot reload on port 3000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev            # Hot reload on port 3001
```

> [!NOTE]
> You still need PostgreSQL, Redis, and ClickHouse running. The simplest approach is to run the data-only services via Docker:
> ```bash
> docker compose up -d postgres redis clickhouse minio
> ```

---

## Production Deployment

> [!CAUTION]
> Never run with `NODE_ENV=development` in production. Always configure HTTPS and generate a strong `JWT_SECRET`.

**1. Generate SSL certificates**

```bash
./nginx/generate-ssl.sh
```

**2. Configure production environment**

```bash
cp backend/.env.example backend/.env
# Set NODE_ENV=production, all required secrets, and your domain URLs
```

**3. Deploy**

```bash
docker compose -f docker-compose.prod.yml up -d
```

The production compose file adds:
- **Nginx** as the only externally exposed service (ports 80/443)
- All application services communicate on an internal Docker network
- Structured JSON logging with `max-size: 50m` rotation

---

## Database Management

### TypeORM Migrations

```bash
cd backend

# Generate a migration from entity changes
npm run migration:generate -- ./src/database/migrations/DescriptiveName

# Run all pending migrations
npm run migration:run

# Revert the last migration
npm run migration:revert
```

### Database Schema Notes

- **pgvector**: The `issues` table has a `float[]` `embedding` column populated asynchronously via BullMQ workers. Used by the semantic search and RAG pipelines.
- **Full-text search**: A PostgreSQL trigger auto-updates a `tsvector` `search_vector` column on `issues` for GIN-indexed full-text queries.
- **Composite indexes**: 16 composite indexes on the `issues` table cover common Kanban query patterns (project + status, project + assignee, project + priority, etc.).

---

## Testing

```bash
# Backend unit tests
cd backend
npm test

# Backend unit tests with coverage
npm run test:cov

# Backend E2E tests (requires running services)
npm run test:e2e

# Frontend unit tests (Jest + Testing Library)
cd frontend
npm test

# Frontend E2E tests (Playwright)
npm run test:e2e
```

The test stack uses:
- **Jest** — Unit and integration testing
- **Supertest** — HTTP integration tests for controllers
- **Testing Library** — React component tests
- **Playwright** — Full browser E2E tests

---

## Development Guide

### Adding a New Backend Module

1. Generate with NestJS CLI: `npx nest g module <name>`
2. Create the entity in `entities/<name>.entity.ts` with a `@TenantScopedEntity()` base
3. Create a `ports/<name>.repository.ts` abstract class (DIP)
4. Implement in `adapters/<name>.typeorm.repository.ts`
5. Register the binding in `<name>.module.ts`: `{ provide: NameRepository, useClass: TypeOrmNameRepository }`
6. Register the module in the correct layer of `app.module.ts`

### SOLID Enforcement Rules

Before submitting a PR, verify against `SOLID_STANDARDS.md`:

| Rule | Check |
|---|---|
| **SRP** | Controllers have zero business logic. Services have zero raw SQL. |
| **OCP** | No `switch(type)` on domain types — use Strategy Pattern. |
| **ISP** | No "God Interfaces" — split into `IReader` + `IWriter`. |
| **DIP** | Services inject abstract classes / tokens, never concrete repos. |
| **Size** | No service exceeds 300 lines — extract into focused providers. |
| **Types** | Zero `any` types in new code. |

### AI Provider Configuration

Zenith supports multiple LLM backends via `AIProviderService`. Configure in `.env`:

```env
OPENAI_API_KEY=sk-...         # GPT-4 (default embeddings model)
GEMINI_API_KEY=...            # Google Gemini (fallback)
GROQ_API_KEY=...              # Groq (fast inference, low latency)
```

The `AiCostGuardService` enforces per-request token limits. Adjust the budget thresholds in `ai-cost-guard.service.ts`.

---

## API Reference

Interactive Swagger documentation is available at runtime:

- **Development**: http://localhost:3000/api/docs
- **Production**: https://your-domain.com/api/docs

All endpoints require a Bearer JWT token (obtained from `POST /auth/login`) except public auth routes.

---

## Contributing

We welcome contributions. Please read the rules below before submitting a pull request.

### Workflow

1. **Fork** the repository
2. **Create** a feature branch from `main`: `git checkout -b feature/my-feature`
3. **Follow** the SOLID standards in `SOLID_STANDARDS.md` (enforced in PR review)
4. **Write tests** for new services and critical paths
5. **Commit** with Conventional Commits format (see below)
6. **Open** a Pull Request against `main`

### Commit Convention

```
feat: add Microsoft Teams notification adapter
fix: resolve lexorank collision on rapid drag
refactor: extract IssueFilterService from IssuesService (SRP)
chore: upgrade TypeORM to 0.3.24
docs: add RAG architecture diagram
test: add BoardGateway integration tests
```

### PR Checklist

- [ ] All unit tests pass (`npm test`)
- [ ] No `any` types introduced
- [ ] New services use abstract repository tokens (DIP)
- [ ] New controllers have zero business logic (SRP)
- [ ] Tenant scoping applied to all new database queries
- [ ] Audit logging added for any security-sensitive operations

---

## Contact

**Kutubuddin Rasel** — [juwelkutubuddin@gmail.com](mailto:juwelkutubuddin@gmail.com)

**Project Repository** — [https://github.com/Kutubuddin-Rasel/ZENITH](https://github.com/Kutubuddin-Rasel/ZENITH)

---

## License

This project is currently **UNLICENSED** — all rights reserved. Contact the author for licensing inquiries.
