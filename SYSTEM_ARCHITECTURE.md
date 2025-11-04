# Zenith Project Management System - Architecture Document

**Version:** 1.0.0  
**Last Updated:** January 2025  
**Status:** Active Development

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Backend Architecture](#3-backend-architecture)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Data Models & Relationships](#5-data-models--relationships)
6. [Key Features Implementation](#6-key-features-implementation)
7. [Development Patterns & Conventions](#7-development-patterns--conventions)
8. [Current System Capabilities](#8-current-system-capabilities)
9. [Technical Debt & Known Issues](#9-technical-debt--known-issues)
10. [Future Development Roadmap](#10-future-development-roadmap)
11. [Development Guidelines](#11-development-guidelines)
12. [Testing Strategy](#12-testing-strategy)
13. [Deployment & Operations](#13-deployment--operations)
14. [Dependencies & Package Management](#14-dependencies--package-management)
15. [Performance Considerations](#15-performance-considerations)
16. [Glossary](#16-glossary)
17. [Change Log](#17-change-log)

---

## 1. Project Overview

### 1.1 Project Name & Purpose
**Zenith** is an enterprise-grade project management system designed to provide comprehensive project tracking, issue management, team collaboration, and workflow automation capabilities.

### 1.2 Tech Stack Summary

**Backend:**
- **Framework:** NestJS 11.0.1 (Node.js)
- **Language:** TypeScript 5.7.3
- **Database:** PostgreSQL (with TypeORM 0.3.24)
- **Cache:** Redis (ioredis 5.8.0)
- **Authentication:** JWT + Passport.js + 2FA (Speakeasy)
- **Real-time:** Socket.io 4.8.1
- **Session Management:** Express Session + Redis

**Frontend:**
- **Framework:** Next.js 15.3.3 (React 18.2.0)
- **Language:** TypeScript 5
- **Styling:** TailwindCSS 3.4.17
- **State Management:** React Context API + TanStack Query (React Query)
- **Real-time:** Socket.io Client 4.8.1
- **UI Components:** Headless UI, Heroicons, Lucide React
- **Form Management:** React Hook Form + Zod validation

### 1.3 Key Features and Capabilities

1. **Project Management**
   - Multi-project support with unique keys
   - Project templates and wizard-based setup
   - Project archiving and organization

2. **Issue Tracking**
   - Comprehensive issue management (Epic, Story, Task, Bug, Sub-task)
   - Multiple status workflows
   - Priority and story point assignment
   - Parent-child issue relationships

3. **Agile/Scrum Support**
   - Sprint planning and tracking
   - Backlog management
   - Board views (Kanban-style)
   - Release planning

4. **Team Collaboration**
   - Role-based access control (RBAC)
   - Project memberships with roles
   - Comments and attachments
   - Watchers and notifications
   - Real-time updates via WebSockets

5. **Workflow Automation**
   - Custom workflow designer
   - Automation rules engine
   - Workflow templates
   - Execution tracking and analytics

6. **Integrations**
   - GitHub (repository sync, PR tracking)
   - Jira (bidirectional issue sync)
   - Slack (notifications, commands)
   - Google Workspace (Calendar, Drive, Gmail)
   - Microsoft Teams (notifications, meetings)
   - Trello (board import)
   - Universal search across integrations

7. **Resource Management**
   - Capacity planning
   - Resource allocation
   - Skill matching
   - Conflict detection
   - Predictive analytics

8. **Security & Compliance**
   - JWT authentication
   - Two-factor authentication (2FA)
   - SAML SSO support
   - Session management
   - IP-based access control
   - Audit logging
   - Data encryption

9. **User Experience**
   - Intelligent onboarding system
   - Progressive disclosure UI
   - Smart defaults based on user behavior
   - User satisfaction surveys
   - Onboarding progress tracking

10. **Advanced Features**
    - Taxonomy management (labels, components)
    - Epics and stories
    - Revisions and history tracking
    - Reports and analytics
    - Performance monitoring
    - API optimization

### 1.4 Target Users and Use Cases

- **Software Development Teams:** Agile/Scrum project management
- **Product Managers:** Roadmap planning and feature tracking
- **Project Managers:** Resource allocation and capacity planning
- **QA Teams:** Bug tracking and test management
- **Enterprise Organizations:** Multi-project portfolio management with SSO

---

## 2. System Architecture Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Pages      │  │  Components  │  │   Context    │      │
│  │  (App Router)│  │  (Reusable) │  │  (State)     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │               │
│         └──────────────────┼──────────────────┘               │
│                            │                                  │
│                    ┌───────▼────────┐                        │
│                    │   API Client    │                        │
│                    │   (Fetcher)     │                        │
│                    └───────┬────────┘                        │
└────────────────────────────┼──────────────────────────────────┘
                             │ HTTP/REST
                             │ WebSocket
┌────────────────────────────┼──────────────────────────────────┐
│                    ┌───────▼────────┐                        │
│                    │   API Gateway  │                        │
│                    │   (NestJS)      │                        │
│                    └───────┬────────┘                        │
│                            │                                  │
│  ┌─────────────────────────┼─────────────────────────┐       │
│  │                         │                         │       │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐        │       │
│  │ Auth     │    │ Business │    │  Real-time│       │       │
│  │ Layer    │    │  Logic   │    │  Gateway  │       │       │
│  │ (JWT)    │    │ Services │    │ (Socket.io)│      │       │
│  └──────────┘    └──────────┘    └──────────┘        │       │
│                            │                                  │
│                    ┌───────▼────────┐                        │
│                    │  Data Access    │                        │
│                    │  Layer (TypeORM)│                        │
│                    └───────┬────────┘                        │
└────────────────────────────┼──────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
    ┌─────▼─────┐    ┌──────▼──────┐    ┌─────▼─────┐
    │ PostgreSQL│    │    Redis    │    │ External  │
    │ (Primary) │    │   (Cache)   │    │   APIs    │
    └───────────┘    └─────────────┘    └───────────┘
```

### 2.2 Architecture Style
**Monolithic Modular Architecture** - Single application with well-organized modules following Domain-Driven Design principles.

### 2.3 Communication Patterns

1. **HTTP/REST:** Primary communication between frontend and backend
2. **WebSocket (Socket.io):** Real-time updates for boards, notifications
3. **Event-Driven:** Internal event system using NestJS EventEmitter
4. **External APIs:** RESTful integrations with third-party services

### 2.4 Data Flow Overview

1. **User Request → Frontend:**
   - User interacts with UI component
   - Component calls hook (e.g., `useProject`, `useCreateIssue`)
   - Hook uses `apiFetch` to make HTTP request

2. **Frontend → Backend:**
   - Request includes JWT token in Authorization header
   - Validation pipe processes DTO
   - Guards check authentication/authorization

3. **Backend Processing:**
   - Controller receives request
   - Service layer executes business logic
   - TypeORM queries PostgreSQL
   - Results cached in Redis (if applicable)

4. **Backend → Frontend:**
   - Response sent as JSON
   - React Query caches response
   - UI updates reactively

5. **Real-time Updates:**
   - Backend emits Socket.io events
   - Frontend Socket.io client receives events
   - UI updates automatically

---

## 3. Backend Architecture

### 3.1 Technology Stack

- **Framework:** NestJS 11.0.1
- **Runtime:** Node.js (v22+)
- **Language:** TypeScript 5.7.3
- **Database:** PostgreSQL (TypeORM 0.3.24)
- **ORM:** TypeORM with decorators and migrations
- **Cache:** Redis (ioredis 5.8.0)
- **Authentication:** Passport.js with JWT strategy
- **Validation:** class-validator + class-transformer
- **WebSockets:** Socket.io 4.8.1
- **Scheduling:** @nestjs/schedule (node-cron)
- **Security:** Helmet, bcrypt, crypto-js
- **File Upload:** Multer (via NestJS)

### 3.2 Project Structure

```
/backend
  /src
    /access-control          # IP-based access control
    /app.controller.ts       # Root controller
    /app.module.ts           # Root module (imports all modules)
    /app.service.ts          # Root service
    /main.ts                 # Application bootstrap
    
    /attachments             # File attachment management
    /audit                   # Audit logging system
      /controllers
      /entities
      /interceptors
      /services
    
    /auth                    # Authentication & authorization
      /controllers          # SAML, 2FA controllers
      /decorators           # @Public, @Roles decorators
      /dto                  # Request/response DTOs
      /entities            # SAML config, 2FA entities
      /guards              # JWT, Local, Permissions guards
      /services            # Auth, 2FA services
      /strategies          # Passport strategies (JWT, Local)
      /types               # Type definitions
    
    /backlog                # Backlog management
    /boards                 # Kanban board functionality
      /dto
      /entities
      boards.gateway.ts     # WebSocket gateway
    
    /cache                  # Caching service
    /comments               # Issue comments
    /database               # Database configuration & migrations
      /config              # TypeORM config
      /migrations          # Database migrations
      /services            # Query optimizer
    
    /encryption             # Encryption utilities
    /epics                  # Epic management
    /integrations           # Third-party integrations
      /controllers         # Integration marketplace, management
      /entities            # Integration, sync log, search index
      /services            # GitHub, Jira, Slack, etc. integrations
    
    /invites                # Project invitation system
    /issues                 # Issue management
      /entities            # Issue, work log entities
    /membership             # Project membership management
      /project-members     # Project member CRUD
    /notifications          # Notification system
      notifications.gateway.ts  # WebSocket gateway
    /onboarding             # Intelligent onboarding
    /performance            # Performance monitoring
    /project-templates      # Project templates & wizard
    /projects               # Project management
    /releases               # Release management
    /reports                # Reporting system
    /resource-management    # Resource allocation & planning
      /controllers         # Capacity, allocation, analytics, skills
      /entities            # User capacity, allocation, conflicts
      /services            # Resource services
    /revisions              # Change history tracking
    /satisfaction           # User satisfaction surveys
    /session                # Session management
    /sprints                # Sprint management
    /taxonomy               # Labels, components, categorization
    /user-preferences       # User preferences & smart defaults
    /users                  # User management
    /watchers               # Issue watchers
    /workflows              # Workflow automation
      /controllers         # Automation rules, templates, designer
      /entities            # Workflow, automation rule entities
      /services            # Workflow engine, automation service
  /test                    # E2E tests
  /uploads                 # File uploads directory
```

### 3.3 Database Architecture

#### 3.3.1 Database Type and Configuration
- **Type:** PostgreSQL
- **Connection Pooling:** pg-pool with configurable settings
- **Replication:** Master-slave setup for production (read/write splitting)
- **SSL:** Enabled in production with certificate validation

#### 3.3.2 Key Database Tables/Entities (46 total)

**Core Entities:**
- `users` - User accounts
- `projects` - Projects
- `issues` - Issues/tasks
- `sprints` - Sprints
- `boards` / `board_columns` - Kanban boards
- `epics` / `stories` - Epic and story management
- `releases` - Release planning

**Relationship Entities:**
- `project_members` - Project membership with roles
- `invites` - Project invitations
- `watchers` - Issue watchers
- `comments` - Issue comments
- `attachments` - File attachments
- `issue_release` - Issue-release relationships
- `sprint_issue` - Sprint-issue relationships

**Taxonomy:**
- `labels` - Issue labels
- `issue_label` - Issue-label relationships
- `components` - Issue components
- `issue_component` - Issue-component relationships

**Workflow & Automation:**
- `workflows` - Workflow definitions
- `workflow_templates` - Workflow templates
- `workflow_executions` - Workflow execution history
- `automation_rules` - Automation rule definitions

**Integrations:**
- `integrations` - Integration configurations
- `external_data` - External data storage
- `sync_logs` - Integration sync history
- `search_index` - Universal search index

**Resource Management:**
- `user_capacity` - User capacity planning
- `resource_allocations` - Resource allocation records
- `resource_conflicts` - Allocation conflicts
- `resource_forecasts` - Predictive forecasts
- `skill_matrix` - Skills and expertise

**Security & Access:**
- `sessions` - User sessions
- `saml_configs` - SAML SSO configurations
- `two_factor_auth` - 2FA settings
- `ip_access_rules` - IP-based access control
- `audit_logs` - Audit trail

**User Experience:**
- `onboarding_progress` - Onboarding step tracking
- `user_preferences` - User preferences
- `satisfaction_surveys` - User satisfaction data
- `satisfaction_metrics` - Satisfaction analytics

**System:**
- `revisions` - Change history
- `notifications` - User notifications
- `project_templates` - Project templates
- `work_logs` - Time tracking

#### 3.3.3 Key Relationships

```
User
  ├── 1:N → Project (via project_members)
  ├── 1:N → Issue (reporter, assignee)
  ├── 1:N → Session
  ├── 1:1 → UserPreferences
  ├── 1:1 → TwoFactorAuth
  └── 1:N → OnboardingProgress

Project
  ├── 1:N → Issue
  ├── 1:N → Sprint
  ├── 1:N → Board
  ├── 1:N → Epic
  ├── 1:N → Release
  ├── 1:N → ProjectMember
  └── 1:N → Invite

Issue
  ├── N:1 → Project
  ├── N:1 → User (reporter, assignee)
  ├── 1:N → Issue (children)
  ├── N:1 → Issue (parent)
  ├── N:M → Label (via issue_label)
  ├── N:M → Component (via issue_component)
  ├── 1:N → Comment
  ├── 1:N → Attachment
  ├── 1:N → Watcher
  ├── 1:N → WorkLog
  └── N:M → Sprint (via sprint_issue)
```

#### 3.3.4 Indexing Strategy
- Primary keys: UUID (auto-generated)
- Unique constraints: `projects.key`, `projects.name`, `users.email`
- Composite indexes: `[projectId, isActive]`, `[triggerType, isActive]`
- Foreign key indexes: All foreign key columns indexed
- Full-text search: PostgreSQL full-text search on search_index table

### 3.4 API Architecture

#### 3.4.1 API Design Pattern
**RESTful API** with NestJS decorators

#### 3.4.2 Base URL and Versioning
- **Base URL:** `http://localhost:3000` (development)
- **API Prefix:** `/api` (optional, some endpoints use it)
- **Versioning:** Not currently versioned (future: `/api/v1`)

#### 3.4.3 Authentication/Authorization Mechanism

**Authentication:**
- **JWT Token:** Bearer token in `Authorization` header
- **Session-based:** Express Session with Redis store (optional)
- **2FA:** Time-based OTP (TOTP) via Speakeasy
- **SAML:** SSO support via Passport SAML

**Authorization:**
- **Guards:**
  - `JwtAuthGuard` - Validates JWT token (global)
  - `PermissionsGuard` - Checks user permissions (global)
  - `LocalAuthGuard` - Local strategy for login
- **Decorators:**
  - `@Public()` - Bypasses authentication
  - `@Roles()` - Role-based access control
  - `@Permissions()` - Permission-based access control

#### 3.4.4 Request/Response Patterns

**Request Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
X-Request-ID: <optional_request_id>
```

**Response Format:**
```json
{
  "data": {...},
  "message": "Success",
  "statusCode": 200
}
```

**Error Response:**
```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

#### 3.4.5 Endpoint Documentation

**Authentication Endpoints:**
| Method | Endpoint | Purpose | Auth Required | Controller |
|--------|----------|---------|---------------|------------|
| POST | `/auth/login` | User login | No | AuthController |
| POST | `/auth/register` | User registration | No | AuthController |
| POST | `/auth/verify-2fa-login` | Verify 2FA token | No | AuthController |
| GET | `/auth/me` | Get current user | Yes | AuthController |
| GET | `/auth/profile` | Get user profile | Yes | AuthController |

**2FA Endpoints:**
| Method | Endpoint | Purpose | Auth Required | Controller |
|--------|----------|---------|---------------|------------|
| POST | `/auth/2fa/generate` | Generate 2FA QR code | Yes | TwoFactorAuthController |
| POST | `/auth/2fa/verify` | Verify and enable 2FA | Yes | TwoFactorAuthController |
| POST | `/auth/2fa/verify-login` | Verify 2FA on login | No | TwoFactorAuthController |
| GET | `/auth/2fa/status` | Get 2FA status | Yes | TwoFactorAuthController |
| POST | `/auth/2fa/regenerate-backup-codes` | Regenerate backup codes | Yes | TwoFactorAuthController |
| POST | `/auth/2fa/disable` | Disable 2FA | Yes | TwoFactorAuthController |

**SAML Endpoints:**
| Method | Endpoint | Purpose | Auth Required | Controller |
|--------|----------|---------|---------------|------------|
| GET | `/auth/saml/metadata/:configId` | Get SP metadata | No | SAMLController |
| POST | `/auth/saml/:configId/callback` | SAML callback | No | SAMLController |
| POST | `/auth/saml/config` | Create SAML config | Yes | SAMLController |
| PUT | `/auth/saml/config/:id` | Update SAML config | Yes | SAMLController |

**Project Endpoints:**
| Method | Endpoint | Purpose | Auth Required | Controller |
|--------|----------|---------|---------------|------------|
| GET | `/projects` | List projects | Yes | ProjectsController |
| POST | `/projects` | Create project | Yes | ProjectsController |
| GET | `/projects/:id` | Get project | Yes | ProjectsController |
| PUT | `/projects/:id` | Update project | Yes | ProjectsController |
| DELETE | `/projects/:id` | Delete project | Yes | ProjectsController |

**Issue Endpoints:**
| Method | Endpoint | Purpose | Auth Required | Controller |
|--------|----------|---------|---------------|------------|
| GET | `/projects/:projectId/issues` | List issues | Yes | IssuesController |
| POST | `/projects/:projectId/issues` | Create issue | Yes | IssuesController |
| GET | `/projects/:projectId/issues/:id` | Get issue | Yes | IssuesController |
| PUT | `/projects/:projectId/issues/:id` | Update issue | Yes | IssuesController |
| DELETE | `/projects/:projectId/issues/:id` | Delete issue | Yes | IssuesController |
| PATCH | `/projects/:projectId/issues/:id/status` | Update status | Yes | IssuesController |

**Sprint Endpoints:**
| Method | Endpoint | Purpose | Auth Required | Controller |
|--------|----------|---------|---------------|------------|
| GET | `/projects/:projectId/sprints` | List sprints | Yes | SprintsController |
| POST | `/projects/:projectId/sprints` | Create sprint | Yes | SprintsController |
| GET | `/projects/:projectId/sprints/:id` | Get sprint | Yes | SprintsController |
| PUT | `/projects/:projectId/sprints/:id` | Update sprint | Yes | SprintsController |
| DELETE | `/projects/:projectId/sprints/:id` | Delete sprint | Yes | SprintsController |
| POST | `/projects/:projectId/sprints/:id/issues` | Add issue to sprint | Yes | SprintsController |

**Board Endpoints:**
| Method | Endpoint | Purpose | Auth Required | Controller |
|--------|----------|---------|---------------|------------|
| GET | `/projects/:projectId/boards` | List boards | Yes | BoardsController |
| POST | `/projects/:projectId/boards` | Create board | Yes | BoardsController |
| GET | `/projects/:projectId/boards/:id` | Get board | Yes | BoardsController |
| PUT | `/projects/:projectId/boards/:id` | Update board | Yes | BoardsController |
| DELETE | `/projects/:projectId/boards/:id` | Delete board | Yes | BoardsController |
| PATCH | `/projects/:projectId/boards/:id/move-issue` | Move issue | Yes | BoardsController |

**Integration Endpoints:**
| Method | Endpoint | Purpose | Auth Required | Controller |
|--------|----------|---------|---------------|------------|
| GET | `/api/integrations` | List integrations | Yes | IntegrationController |
| POST | `/api/integrations` | Create integration | Yes | IntegrationController |
| GET | `/api/integrations/:id` | Get integration | Yes | IntegrationController |
| PUT | `/api/integrations/:id` | Update integration | Yes | IntegrationController |
| DELETE | `/api/integrations/:id` | Delete integration | Yes | IntegrationController |
| POST | `/api/integrations/:id/sync` | Trigger sync | Yes | IntegrationController |
| GET | `/api/integrations/marketplace/available` | List available integrations | No | IntegrationMarketplaceController |

**Workflow Endpoints:**
| Method | Endpoint | Purpose | Auth Required | Controller |
|--------|----------|---------|---------------|------------|
| GET | `/api/workflows` | List workflows | Yes | WorkflowsController |
| POST | `/api/workflows` | Create workflow | Yes | WorkflowsController |
| GET | `/api/workflows/:id` | Get workflow | Yes | WorkflowsController |
| PUT | `/api/workflows/:id` | Update workflow | Yes | WorkflowsController |
| DELETE | `/api/workflows/:id` | Delete workflow | Yes | WorkflowsController |
| POST | `/api/workflows/:id/execute` | Execute workflow | Yes | WorkflowsController |

**Automation Rules Endpoints:**
| Method | Endpoint | Purpose | Auth Required | Controller |
|--------|----------|---------|---------------|------------|
| GET | `/api/automation-rules` | List rules | Yes | AutomationRulesController |
| POST | `/api/automation-rules` | Create rule | Yes | AutomationRulesController |
| GET | `/api/automation-rules/:id` | Get rule | Yes | AutomationRulesController |
| PUT | `/api/automation-rules/:id` | Update rule | Yes | AutomationRulesController |
| DELETE | `/api/automation-rules/:id` | Delete rule | Yes | AutomationRulesController |
| POST | `/api/automation-rules/:id/toggle` | Toggle rule | Yes | AutomationRulesController |

**Resource Management Endpoints:**
| Method | Endpoint | Purpose | Auth Required | Controller |
|--------|----------|---------|---------------|------------|
| GET | `/api/resource-management/capacity` | Get capacity dashboard | Yes | CapacityPlanningController |
| GET | `/api/resource-management/allocation` | Get allocation dashboard | Yes | ResourceAllocationController |
| GET | `/api/resource-management/analytics` | Get analytics | Yes | ResourceAnalyticsController |
| GET | `/api/resource-management/skills` | Get skill dashboard | Yes | SkillMatchingController |

**User Endpoints:**
| Method | Endpoint | Purpose | Auth Required | Controller |
|--------|----------|---------|---------------|------------|
| GET | `/users` | List users | Yes | UsersController |
| GET | `/users/:id` | Get user | Yes | UsersController |
| GET | `/users/me/project-memberships` | Get user memberships | Yes | UsersController |

*Note: This is a partial list. The system has 343+ endpoints across 39 controllers.*

### 3.5 Business Logic Layer

**Core Services and Responsibilities:**

1. **AuthService** - Authentication, token generation, user validation
2. **TwoFactorAuthService** - 2FA setup, verification, backup codes
3. **ProjectsService** - Project CRUD, validation, key generation
4. **IssuesService** - Issue management, status transitions, relationships
5. **SprintsService** - Sprint management, issue assignment, velocity calculation
6. **BoardsService** - Board management, column configuration, issue ordering
7. **AutomationRulesService** - Rule execution, trigger evaluation, action execution
8. **WorkflowEngineService** - Workflow execution, state management
9. **IntegrationService** - Integration management, sync orchestration
10. **ResourceAllocationService** - Capacity planning, conflict detection
11. **SmartDefaultsService** - Learning system for user preferences
12. **OnboardingService** - Onboarding progress tracking, step management

**Data Validation:**
- DTOs with `class-validator` decorators
- Global `ValidationPipe` with whitelist and transformation
- Custom validators for business rules

**Business Rules:**
- Project keys must be unique
- Issue status transitions follow workflow rules
- Sprint capacity cannot exceed team capacity
- Resource conflicts trigger alerts
- Automation rules execute based on triggers and conditions

### 3.6 Security Implementation

**Authentication Strategy:**
- **Primary:** JWT tokens with Bearer authentication
- **Secondary:** Express Session with Redis (optional)
- **2FA:** TOTP (Time-based One-Time Password) via Speakeasy
- **SSO:** SAML 2.0 via Passport SAML

**Authorization:**
- **Role-Based Access Control (RBAC):** Project roles (Admin, Developer, QA, etc.)
- **Permission-Based:** Fine-grained permissions per resource
- **IP-Based Access Control:** IP whitelist/blacklist support

**Security Measures:**
- **Password Hashing:** bcrypt with salt rounds
- **Data Encryption:** crypto-js for sensitive data
- **HTTPS:** SSL/TLS support with certificate management
- **Security Headers:** Helmet.js configured
- **CORS:** Configured with allowed origins
- **Rate Limiting:** (Future implementation)
- **Input Validation:** class-validator on all DTOs
- **SQL Injection Protection:** TypeORM parameterized queries
- **XSS Protection:** Content Security Policy headers

**Session Management:**
- Redis-backed sessions
- Session timeout configuration
- Multi-device session tracking
- Session invalidation on logout

### 3.7 External Integrations

**Supported Integrations:**

1. **GitHub**
   - Repository sync
   - Pull request tracking
   - Commit linking
   - Webhook support

2. **Jira**
   - Bidirectional issue sync
   - Status mapping
   - Project import
   - Webhook support

3. **Slack**
   - Real-time notifications
   - Slash commands
   - Channel integration
   - Webhook support

4. **Google Workspace**
   - Calendar sync
   - Drive integration
   - Gmail notifications
   - OAuth 2.0

5. **Microsoft Teams**
   - Team notifications
   - Meeting integration
   - File sharing
   - Webhook support

6. **Trello**
   - Board import
   - Card synchronization
   - Webhook support

**Integration Architecture:**
- **Universal Search Service:** Cross-integration search
- **Sync Logs:** Track synchronization history
- **External Data Storage:** Store external data with metadata
- **Search Index:** Full-text search across integrations
- **Health Monitoring:** Integration health status tracking

**API Keys Management:**
- Encrypted storage in `authConfig` JSONB column
- Per-integration configuration
- Credential rotation support

---

## 4. Frontend Architecture

### 4.1 Technology Stack

- **Framework:** Next.js 15.3.3 (App Router)
- **Library:** React 18.2.0
- **Language:** TypeScript 5
- **UI Library:** TailwindCSS 3.4.17
- **Component Library:** Headless UI 2.2.4, Heroicons
- **Icons:** Lucide React 0.544.0
- **State Management:** React Context API + TanStack Query 5.80.10
- **Form Management:** React Hook Form 7.58.1 + Zod 3.25.67
- **Real-time:** Socket.io Client 4.8.1
- **Charts:** Recharts 2.15.4
- **Drag & Drop:** @dnd-kit 6.3.1
- **Date Handling:** date-fns 4.1.0
- **Notifications:** React Toastify 11.0.5

### 4.2 Project Structure

```
/frontend
  /src
    /app                    # Next.js App Router pages
      /api                  # API routes (if needed)
      /auth                 # Authentication pages
        /login
        /register
      /projects             # Project pages
        /[id]               # Project detail pages
          /board
          /backlog
          /sprints
          /issues
          /releases
          /epics
          /settings
      /integrations         # Integration management
      /resource-management  # Resource management
      /notifications        # Notifications page
      /profile              # User profile
      layout.tsx            # Root layout
      page.tsx              # Home page
      globals.css           # Global styles
    
    /components             # Reusable components
      /AutomationRules
      /GettingStartedChecklist
      /IntegrationHub
      /OnboardingOverlay
      /ProjectWizard
      /ProgressiveDisclosure
      /ResourceManagement
      /SatisfactionSurvey
      /WorkflowDesigner
      /WorkflowTemplates
      AccessControlManagement.tsx
      AddMemberModal.tsx
      Alert.tsx
      AuditDashboard.tsx
      BoardManagementModal.tsx
      Breadcrumbs.tsx
      Button.tsx
      Card.tsx
      ClientLayout.tsx
      CommandPalette.tsx
      CreateBoardWizardModal.tsx
      CreateIssueModal.tsx
      EpicDetailModal.tsx
      FormError.tsx
      Input.tsx
      Label.tsx
      Modal.tsx
      NotificationBell.tsx
      NotificationPopover.tsx
      PageLayout.tsx
      PerformanceDashboard.tsx
      ProjectIssueSidebar.tsx
      ProtectedProjectRoute.tsx
      ProtectedRoute.tsx
      QueryClientWrapper.tsx
      QuickCreateIssueForm.tsx
      ReleaseDetailModal.tsx
      RoleBadge.tsx
      SAMLConfiguration.tsx
      SessionManagement.tsx
      Sidebar.tsx
      SpeedDialFAB.tsx
      SprintDetailModal.tsx
      Topbar.tsx
      TwoFactorAuthManagement.tsx
      UserMenu.tsx
      ... (73 total components)
    
    /context                # React Context providers
      AuthContext.tsx
      NotificationsSocketProvider.tsx
      ProgressiveDisclosureContext.tsx
      ProjectsCreateModalContext.ts
      RoleContext.tsx
      ThemeContext.tsx
      ToastContext.tsx
    
    /hooks                   # Custom React hooks
      useAvailableEmployees.ts
      useBacklog.ts
      useBoard.ts
      useBoardIssues.ts
      useCreateIssue.ts
      useEpics.ts
      useEpicStories.ts
      useInviteProjectMember.ts
      useLazyLoad.ts
      useMoveIssueToSprint.ts
      useNotifications.ts
      useOnboardingProgress.ts
      useProject.ts
      useProjectAttachments.ts
      useProjectInvites.ts
      useProjectIssues.ts
      useProjectMembers.ts
      useProjects.ts
      useProjectSummary.ts
      useReleaseIssues.ts
      useReleases.ts
      useRemoveProjectMember.ts
      useReorderBoardIssues.ts
      useReports.ts
      useSmartDefaults.ts
      useSprintIssues.ts
      useSprints.ts
      useTaxonomy.ts
      useUpdateIssueStatus.ts
      useUserSatisfaction.ts
      ... (30 total hooks)
    
    /lib                     # Utility libraries
      fetcher.ts             # API client
      performance.ts         # Performance utilities
      security.ts            # Security utilities
      socket.ts              # Socket.io client
    
    /constants               # Constants
      issueOptions.ts
    
    /styles                  # Additional styles
  /public                    # Static assets
    /fonts
    /manifest.json
    /sw.js                   # Service worker
  next.config.ts             # Next.js configuration
  tailwind.config.ts         # TailwindCSS configuration
  tsconfig.json              # TypeScript configuration
```

### 4.3 Component Architecture

**Component Organization Pattern:**
- **Atomic Design:** Components organized by complexity
- **Feature-based:** Components grouped by feature (e.g., AutomationRules/)
- **Shared Components:** Reusable UI components at root level

**Reusable Components Inventory:**
- **Layout:** PageLayout, ClientLayout, Sidebar, Topbar
- **Forms:** Input, TextArea, Button, Label, FormError
- **Modals:** Modal, ConfirmationModal, CreateIssueModal
- **Navigation:** Breadcrumbs, CommandPalette
- **Data Display:** Card, Badge, Alert, Typography
- **Feature Components:** ProjectWizard, WorkflowDesigner, IntegrationHub

**Component Composition Strategy:**
- Higher-order components for common patterns
- Compound components for complex UI (e.g., Modal + Form)
- Render props for flexible data rendering

**Props and State Management:**
- Props for parent-child communication
- Context for global state (Auth, Theme, Notifications)
- React Query for server state
- Local state with useState for component-specific state

### 4.4 State Management

**Global State Structure:**

1. **AuthContext:**
   - `user`: Current user object
   - `token`: JWT token
   - `loading`: Authentication loading state
   - `isSuperAdmin`: Admin status
   - `projectRoles`: Project role mappings
   - Methods: `login`, `logout`, `register`, `refreshUserData`

2. **ThemeContext:**
   - `theme`: Current theme (light/dark)
   - `toggleTheme`: Theme switching function

3. **ToastContext:**
   - Toast notification management
   - Methods: `showToast`, `hideToast`

4. **RoleContext:**
   - Current user's role in active project
   - Role-based UI rendering

5. **NotificationsSocketProvider:**
   - WebSocket connection management
   - Real-time notification state

6. **ProgressiveDisclosureContext:**
   - Feature visibility based on user experience
   - Progressive disclosure state

**State Management Library:**
- **TanStack Query (React Query):** Server state management
  - Automatic caching
  - Background refetching
  - Optimistic updates
  - Request deduplication

**Data Flow:**
1. Component calls custom hook (e.g., `useProject`)
2. Hook uses React Query to fetch data
3. React Query caches response
4. Component receives data reactively
5. Mutations trigger cache invalidation

**Local vs. Global State Strategy:**
- **Global:** Authentication, theme, notifications, user preferences
- **Local:** Form inputs, modal visibility, component-specific UI state
- **Server State:** All API data via React Query

### 4.5 Routing Architecture

**Routing Library:** Next.js App Router (file-based routing)

**Route Structure:**
```
/                           # Home page
/auth/login                 # Login page
/auth/register              # Registration page
/projects                   # Projects list
/projects/[id]              # Project detail
  /board                    # Kanban board
  /backlog                  # Backlog view
  /sprints                  # Sprint planning
  /issues                   # Issue list
  /releases                 # Release planning
  /epics                    # Epic management
  /settings                 # Project settings
/integrations               # Integration management
/resource-management        # Resource management
/notifications              # Notifications page
/profile                   # User profile
```

**Protected Routes Implementation:**
- `ProtectedRoute` component wraps routes requiring authentication
- `ProtectedProjectRoute` component checks project membership
- Redirects to `/auth/login` if not authenticated
- Redirects to `/projects` if no project access

**Navigation Patterns:**
- Programmatic navigation via `useRouter` from Next.js
- Link components for client-side navigation
- Breadcrumbs for hierarchical navigation
- Command Palette (Cmd+K) for quick navigation

### 4.6 API Integration

**API Client Setup:**
- Custom `apiFetch` function in `/lib/fetcher.ts`
- Base URL: `http://localhost:3000`
- Automatic token injection from localStorage
- Error handling with try/catch

**Request/Response Interceptors:**
- Token injection in request headers
- Error response parsing
- Automatic retry (future implementation)

**Error Handling Strategy:**
- Try/catch blocks in hooks
- Error boundaries for component errors
- Toast notifications for user-facing errors
- Console logging for debugging

**Caching and Optimization:**
- React Query automatic caching
- Stale-while-revalidate strategy
- Query invalidation on mutations
- Optimistic updates for better UX

### 4.7 Authentication Flow

**Login Flow:**
1. User enters email/password
2. `AuthContext.login()` called
3. POST to `/auth/login`
4. Receive JWT token and user data
5. Store token in localStorage
6. Fetch complete user data (profile + roles)
7. Connect WebSocket for notifications
8. Redirect to `/projects`

**Logout Flow:**
1. `AuthContext.logout()` called
2. Remove token from localStorage
3. Clear user state
4. Disconnect WebSocket
5. Redirect to `/auth/login`

**Token Storage and Management:**
- Storage: `localStorage` (key: `access_token`)
- Automatic injection in API requests
- Token refresh (future implementation)

**Protected Route Handling:**
- `ProtectedRoute` checks for token
- Fetches user data if token exists
- Redirects if authentication fails

**Session Persistence Strategy:**
- Token persisted in localStorage
- User data fetched on app load
- WebSocket reconnection on page refresh

---

## 5. Data Models & Relationships

### 5.1 Core Entities

#### User Entity
```typescript
{
  id: string (UUID)
  email: string (unique)
  passwordHash: string
  name: string
  isSuperAdmin: boolean
  isActive: boolean
  defaultRole: string
  avatarUrl?: string
}
```
**Relationships:**
- 1:N → Project (via project_members)
- 1:N → Issue (as reporter, assignee)
- 1:1 → UserPreferences
- 1:1 → TwoFactorAuth
- 1:N → Session

#### Project Entity
```typescript
{
  id: string (UUID)
  name: string (unique)
  key: string (unique)
  description?: string
  isArchived: boolean
  createdAt: Date
  updatedAt: Date
}
```
**Relationships:**
- 1:N → Issue
- 1:N → Sprint
- 1:N → Board
- 1:N → Epic
- 1:N → Release
- 1:N → ProjectMember
- 1:N → Invite

#### Issue Entity
```typescript
{
  id: string (UUID)
  projectId: string
  parentId?: string
  title: string
  description?: string
  status: IssueStatus (enum)
  priority: IssuePriority (enum)
  type: IssueType (enum)
  assigneeId?: string
  reporterId: string
  backlogOrder: number
  storyPoints: number
  createdAt: Date
  updatedAt: Date
}
```
**Status Enum:** BACKLOG, TODO, SELECTED, IN_PROGRESS, IN_REVIEW, BLOCKED, READY_FOR_QA, TESTING, DONE, CLOSED, REOPENED, ON_HOLD

**Priority Enum:** HIGHEST, HIGH, MEDIUM, LOW, LOWEST

**Type Enum:** EPIC, STORY, TASK, BUG, SUBTASK

**Relationships:**
- N:1 → Project
- N:1 → User (reporter, assignee)
- 1:N → Issue (children)
- N:1 → Issue (parent)
- N:M → Label (via issue_label)
- N:M → Component (via issue_component)
- 1:N → Comment
- 1:N → Attachment
- 1:N → Watcher
- 1:N → WorkLog
- N:M → Sprint (via sprint_issue)

#### Sprint Entity
```typescript
{
  id: string (UUID)
  projectId: string
  name: string
  goal?: string
  startDate: Date
  endDate: Date
  isActive: boolean
  status: string
  createdAt: Date
  updatedAt: Date
}
```
**Relationships:**
- N:1 → Project
- N:M → Issue (via sprint_issue)

#### Board Entity
```typescript
{
  id: string (UUID)
  projectId: string
  name: string
  description?: string
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}
```
**Relationships:**
- N:1 → Project
- 1:N → BoardColumn

### 5.2 Entity Relationship Diagram (Text)

```
┌─────────┐
│  User   │
└────┬────┘
     │
     │ 1:N (reporter, assignee)
     │
┌────▼─────────────────────────┐
│          Issue               │
│  ┌────────────────────────┐  │
│  │ - id                   │  │
│  │ - projectId           │  │
│  │ - parentId            │  │
│  │ - title               │  │
│  │ - status              │  │
│  │ - priority            │  │
│  │ - type                │  │
│  │ - assigneeId          │  │
│  │ - reporterId          │  │
│  └────────────────────────┘  │
└────┬─────────────────────────┘
     │
     │ N:1
     │
┌────▼────────┐
│  Project    │
│  ┌────────┐ │
│  │ - id   │ │
│  │ - name │ │
│  │ - key  │ │
│  └────────┘ │
└────┬────────┘
     │
     │ 1:N
     │
┌────▼──────────┐      ┌──────────────┐
│ ProjectMember │      │   Sprint     │
│  ┌──────────┐ │      │  ┌─────────┐ │
│  │ - userId │ │      │  │ - id    │ │
│  │ - role   │ │      │  │ - name  │ │
│  └──────────┘ │      │  │ - dates │ │
└───────────────┘      └──────────────┘
```

### 5.3 Key Business Rules

1. **Project Keys:** Must be unique, uppercase, alphanumeric
2. **Issue Hierarchy:** Parent issues can have multiple children; children cannot be parents
3. **Status Transitions:** Must follow defined workflow rules
4. **Sprint Capacity:** Cannot exceed team capacity
5. **Resource Allocation:** Conflicts trigger alerts
6. **Automation Rules:** Execute based on trigger conditions

---

## 6. Key Features Implementation

### Feature 1: Project Management

**Purpose:** Core project organization and management

**User Stories:**
- As a user, I can create a new project
- As a user, I can view all my projects
- As a user, I can update project details
- As a user, I can archive projects

**Backend Implementation:**
- **Controller:** `ProjectsController`
- **Service:** `ProjectsService`
- **Entity:** `Project`
- **Key Methods:**
  - `create()` - Create project with unique key generation
  - `findAll()` - List projects with filtering
  - `findOne()` - Get project with relationships
  - `update()` - Update project details
  - `remove()` - Delete project (cascade deletes issues)

**Frontend Components:**
- `/app/projects/page.tsx` - Projects list
- `/app/projects/[id]/page.tsx` - Project detail
- `useProjects` hook - Data fetching
- `ProjectWizard` - Template-based project creation

**Data Flow:**
1. User clicks "Create Project"
2. `ProjectWizard` opens
3. User selects template and answers questions
4. POST to `/projects` with project data
5. Backend validates and creates project
6. Frontend receives project and redirects

**API Endpoints Used:**
- `POST /projects` - Create
- `GET /projects` - List
- `GET /projects/:id` - Get
- `PUT /projects/:id` - Update
- `DELETE /projects/:id` - Delete

### Feature 2: Issue Tracking

**Purpose:** Comprehensive issue/task management

**User Stories:**
- As a user, I can create issues
- As a user, I can assign issues to team members
- As a user, I can change issue status
- As a user, I can link related issues

**Backend Implementation:**
- **Controller:** `IssuesController`
- **Service:** `IssuesService`
- **Entity:** `Issue`
- **Key Methods:**
  - `create()` - Create issue with validation
  - `findAll()` - List issues with filters
  - `updateStatus()` - Update issue status
  - `assign()` - Assign issue to user

**Frontend Components:**
- `CreateIssueModal` - Issue creation form
- `ProjectIssueSidebar` - Issue detail sidebar
- `useProjectIssues` hook - Issue data
- `useCreateIssue` hook - Issue creation
- `useUpdateIssueStatus` hook - Status updates

**Data Flow:**
1. User clicks "Create Issue"
2. Modal opens with form
3. User fills form (title, description, assignee, etc.)
4. POST to `/projects/:projectId/issues`
5. Backend creates issue and emits WebSocket event
6. Frontend updates board/backlog reactively

**API Endpoints Used:**
- `POST /projects/:projectId/issues` - Create
- `GET /projects/:projectId/issues` - List
- `GET /projects/:projectId/issues/:id` - Get
- `PUT /projects/:projectId/issues/:id` - Update
- `PATCH /projects/:projectId/issues/:id/status` - Update status

### Feature 3: Kanban Board

**Purpose:** Visual board for issue tracking

**User Stories:**
- As a user, I can view issues on a Kanban board
- As a user, I can drag issues between columns
- As a user, I can see real-time updates from other users

**Backend Implementation:**
- **Controller:** `BoardsController`
- **Service:** `BoardsService`
- **Gateway:** `BoardsGateway` (WebSocket)
- **Entities:** `Board`, `BoardColumn`
- **Key Methods:**
  - `create()` - Create board with columns
  - `moveIssue()` - Move issue between columns
  - `emitIssueMoved()` - WebSocket event emission

**Frontend Components:**
- `/app/projects/[id]/board/page.tsx` - Board view
- `useBoard` hook - Board data
- `useBoardIssues` hook - Issues for board
- `useReorderBoardIssues` hook - Drag and drop
- `@dnd-kit` for drag and drop

**Data Flow:**
1. User opens board view
2. Fetch board configuration and issues
3. Render columns with issues
4. User drags issue to new column
5. PATCH to `/projects/:projectId/boards/:id/move-issue`
6. Backend updates issue and emits WebSocket event
7. All connected clients update in real-time

**API Endpoints Used:**
- `GET /projects/:projectId/boards` - List boards
- `POST /projects/:projectId/boards` - Create board
- `PATCH /projects/:projectId/boards/:id/move-issue` - Move issue

**WebSocket Events:**
- `issue-moved` - Issue moved between columns
- `issue-updated` - Issue updated
- `join-board` - Client joins board room
- `leave-board` - Client leaves board room

### Feature 4: Workflow Automation

**Purpose:** Automate repetitive tasks and workflows

**User Stories:**
- As a user, I can create automation rules
- As a user, I can define triggers and actions
- As a user, I can see automation execution history

**Backend Implementation:**
- **Controller:** `AutomationRulesController`
- **Service:** `AutomationRulesService`
- **Entity:** `AutomationRule`
- **Key Methods:**
  - `createRule()` - Create automation rule
  - `executeRule()` - Execute rule with context
  - `evaluateTrigger()` - Check if trigger conditions met
  - `executeActions()` - Execute defined actions

**Frontend Components:**
- `AutomationRulesManager` - Rule management UI
- `useAutomationRules` hook - Rule data

**Data Flow:**
1. User creates automation rule
2. Defines trigger (e.g., "Issue status changes to Done")
3. Defines actions (e.g., "Send notification", "Update field")
4. Rule saved to database
5. On trigger event, rule executes automatically
6. Results logged in execution history

**API Endpoints Used:**
- `POST /api/automation-rules` - Create rule
- `GET /api/automation-rules` - List rules
- `PUT /api/automation-rules/:id` - Update rule
- `POST /api/automation-rules/:id/execute` - Execute rule

### Feature 5: Integrations

**Purpose:** Connect with external services

**User Stories:**
- As a user, I can connect GitHub
- As a user, I can sync Jira issues
- As a user, I can receive Slack notifications

**Backend Implementation:**
- **Controllers:** `IntegrationController`, `IntegrationMarketplaceController`
- **Services:** Per-integration services (GitHub, Jira, Slack, etc.)
- **Entity:** `Integration`
- **Services:**
  - `GitHubIntegrationService` - GitHub API integration
  - `JiraIntegrationService` - Jira API integration
  - `SlackIntegrationService` - Slack API integration
  - `UniversalSearchService` - Cross-integration search

**Frontend Components:**
- `/app/integrations/page.tsx` - Integration management
- `IntegrationHub` - Integration marketplace
- `IntegrationConfig` - Integration configuration

**Data Flow:**
1. User navigates to integrations page
2. Sees available integrations
3. Clicks "Connect" on integration
4. OAuth flow or API key entry
5. Integration saved to database
6. Periodic sync jobs run
7. Data synced and indexed for search

**API Endpoints Used:**
- `GET /api/integrations/marketplace/available` - List available
- `POST /api/integrations` - Create integration
- `POST /api/integrations/:id/sync` - Trigger sync
- `GET /api/integrations/:id/search` - Search external data

---

## 7. Development Patterns & Conventions

### 7.1 Code Organization

**File Naming Conventions:**
- **Controllers:** `*.controller.ts`
- **Services:** `*.service.ts`
- **Entities:** `*.entity.ts`
- **DTOs:** `*.dto.ts`
- **Guards:** `*.guard.ts`
- **Modules:** `*.module.ts`
- **Hooks:** `use*.ts`
- **Components:** `PascalCase.tsx`

**Folder Structure Rationale:**
- **Domain-driven:** Each feature has its own folder
- **Separation of concerns:** Controllers, services, entities separated
- **Scalability:** Easy to add new features

**Module Organization Principles:**
- One module per feature domain
- Shared modules (Auth, Database) imported globally
- Feature modules self-contained with dependencies injected

### 7.2 Coding Standards

**Style Guide:**
- TypeScript strict mode enabled
- ESLint with TypeScript rules
- Prettier for code formatting
- Consistent naming: camelCase for variables, PascalCase for classes

**Linting and Formatting:**
- ESLint 9.18.0 with TypeScript ESLint
- Prettier 3.4.2
- Auto-fix on save (recommended)

**Code Review Practices:**
- All changes go through code review
- Type safety enforced
- Test coverage required for new features

### 7.3 Design Patterns Used

1. **Repository Pattern:**
   - TypeORM repositories abstract data access
   - Services use repositories, not direct DB access

2. **Service Layer Pattern:**
   - Business logic in services
   - Controllers delegate to services

3. **Dependency Injection:**
   - NestJS DI container
   - Constructor injection for dependencies

4. **Guard Pattern:**
   - Authentication/authorization guards
   - Reusable across routes

5. **DTO Pattern:**
   - Data Transfer Objects for request/response
   - Validation with class-validator

6. **Observer Pattern:**
   - EventEmitter for internal events
   - WebSocket for real-time updates

7. **Factory Pattern:**
   - Database configuration factory
   - Integration service factories

8. **Strategy Pattern:**
   - Passport strategies (JWT, Local)
   - Integration service strategies

---

## 8. Current System Capabilities

### 8.1 Implemented Features (Complete List)

**Core Features:**
✅ User authentication (JWT, 2FA, SAML)
✅ Project management
✅ Issue tracking (Epic, Story, Task, Bug, Sub-task)
✅ Sprint planning and tracking
✅ Kanban board with drag-and-drop
✅ Backlog management
✅ Release planning
✅ Epic and story management
✅ Comments and attachments
✅ Issue watchers
✅ Role-based access control
✅ Project memberships
✅ Project invitations

**Advanced Features:**
✅ Workflow automation
✅ Automation rules engine
✅ Workflow designer
✅ Workflow templates
✅ Resource management
✅ Capacity planning
✅ Resource allocation
✅ Skill matching
✅ Conflict detection
✅ Predictive analytics

**Integrations:**
✅ GitHub integration
✅ Jira integration
✅ Slack integration
✅ Google Workspace integration
✅ Microsoft Teams integration
✅ Trello integration
✅ Universal search

**User Experience:**
✅ Intelligent onboarding
✅ Project wizard with templates
✅ Progressive disclosure UI
✅ Smart defaults
✅ User satisfaction surveys
✅ Onboarding progress tracking

**Security & Compliance:**
✅ Audit logging
✅ Session management
✅ IP-based access control
✅ Data encryption
✅ Security headers (Helmet)

**System Features:**
✅ Taxonomy management (labels, components)
✅ Reports and analytics
✅ Performance monitoring
✅ API optimization
✅ Revision history

### 8.2 Working Functionality

**Fully Functional:**
- Complete authentication flow
- Project CRUD operations
- Issue lifecycle management
- Sprint planning and execution
- Board drag-and-drop
- Real-time updates via WebSocket
- Automation rule execution
- Integration syncing
- Resource allocation

**Partially Functional:**
- Some integrations may need configuration
- Advanced workflow features in development
- Some reporting features may be limited

### 8.3 Performance Characteristics

**Current Performance:**
- API response times: < 200ms average
- Database queries optimized with indexes
- Redis caching for frequently accessed data
- WebSocket connection stable
- Frontend bundle size optimized with code splitting

**Optimization Strategies:**
- Database query optimization
- Connection pooling
- Response compression
- CDN for static assets (future)
- Image optimization

### 8.4 Current Limitations

1. **Scalability:**
   - Single instance deployment
   - No horizontal scaling implemented
   - Database replication configured but not tested at scale

2. **Testing:**
   - Limited test coverage
   - E2E tests not comprehensive
   - Integration tests missing

3. **Documentation:**
   - API documentation incomplete
   - Some features lack user documentation

4. **Monitoring:**
   - Basic logging implemented
   - No APM (Application Performance Monitoring)
   - Limited error tracking

5. **Rate Limiting:**
   - Not implemented
   - Vulnerable to abuse

---

## 9. Technical Debt & Known Issues

### 9.1 Code Quality Concerns

1. **TypeScript `any` Types:**
   - Many `any` types in codebase (774 linting errors remaining)
   - Needs systematic type safety improvements
   - Priority: HIGH

2. **Error Handling:**
   - Inconsistent error handling patterns
   - Some errors not properly typed
   - Priority: MEDIUM

3. **Code Duplication:**
   - Some repeated patterns across modules
   - Could benefit from shared utilities
   - Priority: LOW

### 9.2 Refactoring Opportunities

1. **API Versioning:**
   - No API versioning strategy
   - May need versioning for future changes
   - Priority: MEDIUM

2. **Service Layer:**
   - Some controllers have business logic
   - Should move to service layer
   - Priority: LOW

3. **DTO Validation:**
   - Some DTOs lack comprehensive validation
   - Should add more validation rules
   - Priority: MEDIUM

### 9.3 Bug List and Workarounds

1. **WebSocket Reconnection:**
   - May need manual reconnection on disconnect
   - Workaround: Refresh page
   - Priority: MEDIUM

2. **File Upload:**
   - Large file uploads may timeout
   - Workaround: Use smaller files or chunk upload
   - Priority: LOW

3. **Integration Sync:**
   - Some integrations may fail silently
   - Workaround: Check sync logs manually
   - Priority: MEDIUM

### 9.4 Performance Bottlenecks

1. **Database Queries:**
   - Some N+1 query problems
   - Need eager loading optimization
   - Priority: HIGH

2. **Frontend Bundle:**
   - Initial bundle size could be smaller
   - Code splitting could be improved
   - Priority: MEDIUM

3. **Real-time Updates:**
   - Too many WebSocket events in some cases
   - Need event throttling
   - Priority: LOW

---

## 10. Future Development Roadmap

### 10.1 Planned Features

#### Feature: Advanced Reporting & Analytics
**Description:** Comprehensive reporting with custom dashboards and analytics

**User Stories:**
- As a user, I can create custom reports
- As a user, I can view project analytics
- As a user, I can export reports to PDF/Excel

**Technical Requirements:**
- Report builder UI component
- Chart library integration (Recharts)
- PDF generation service
- Excel export library

**Estimated Complexity:** HIGH

**Dependencies:**
- Current reporting system
- Data aggregation improvements

**Suggested Implementation:**
1. Create report builder component
2. Implement data aggregation service
3. Add export functionality
4. Create dashboard UI

#### Feature: Mobile App
**Description:** Native mobile apps (iOS/Android)

**User Stories:**
- As a user, I can access projects on mobile
- As a user, I can create issues on the go
- As a user, I can receive push notifications

**Technical Requirements:**
- React Native or Flutter
- Mobile API endpoints
- Push notification service
- Offline support

**Estimated Complexity:** VERY HIGH

**Dependencies:**
- API stability
- Mobile design system

**Suggested Implementation:**
1. Choose mobile framework
2. Design mobile UI/UX
3. Implement core features
4. Add push notifications
5. Test on devices

#### Feature: Advanced Permissions System
**Description:** Fine-grained permission system

**User Stories:**
- As an admin, I can set custom permissions
- As a user, I can see what I can/cannot do
- As a project manager, I can delegate permissions

**Technical Requirements:**
- Permission matrix UI
- Permission evaluation engine
- Permission inheritance system

**Estimated Complexity:** MEDIUM

**Dependencies:**
- Current RBAC system
- Access control module

**Suggested Implementation:**
1. Extend permission model
2. Create permission management UI
3. Implement permission evaluation
4. Add permission inheritance

### 10.2 Infrastructure Improvements

**Scalability Enhancements:**
- Horizontal scaling with load balancer
- Database read replicas
- Redis cluster for high availability
- CDN for static assets
- Microservices migration (future)

**Security Improvements:**
- Rate limiting implementation
- API key management
- OAuth 2.0 for third-party apps
- Security audit logging
- Penetration testing

**Performance Optimizations:**
- Database query optimization
- Caching strategy improvement
- Frontend bundle size reduction
- Image CDN integration
- Lazy loading improvements

**DevOps and Deployment:**
- Docker containerization
- Kubernetes orchestration
- CI/CD pipeline (GitHub Actions)
- Automated testing in pipeline
- Blue-green deployment strategy

### 10.3 Refactoring Priorities

**Code Quality Improvements:**
1. Fix all TypeScript `any` types (HIGH)
2. Standardize error handling (MEDIUM)
3. Improve test coverage (HIGH)
4. Add API documentation (MEDIUM)

**Architecture Evolution:**
1. Implement API versioning (MEDIUM)
2. Microservices migration planning (LOW)
3. Event sourcing for audit logs (LOW)
4. CQRS pattern for read/write separation (LOW)

**Dependency Updates:**
- Regular dependency updates
- Security vulnerability monitoring
- Breaking change migration planning

### 10.4 Integration Plans

**New Third-Party Services:**
- **Linear:** Issue tracking integration
- **Asana:** Task management integration
- **Monday.com:** Project management integration
- **GitLab:** Repository integration
- **Bitbucket:** Repository integration

**API Expansions:**
- GraphQL API (alternative to REST)
- Webhook system for external integrations
- Public API for third-party developers
- API rate limiting and quotas

**New External Connections:**
- OAuth 2.0 provider
- SAML IdP improvements
- LDAP/Active Directory integration
- Single Sign-On (SSO) improvements

---

## 11. Development Guidelines

### 11.1 Adding New Features

**Step-by-Step Process:**

1. **Planning:**
   - Define feature requirements
   - Create user stories
   - Design database schema (if needed)
   - Plan API endpoints

2. **Backend Implementation:**
   - Create entity (if needed)
   - Create migration (if schema changes)
   - Create DTOs
   - Create service with business logic
   - Create controller with endpoints
   - Create module and register in AppModule

3. **Frontend Implementation:**
   - Create components
   - Create hooks for data fetching
   - Add routes (if needed)
   - Integrate with existing UI

4. **Testing:**
   - Unit tests for service
   - Integration tests for API
   - E2E tests for user flow

5. **Documentation:**
   - Update API documentation
   - Add user documentation
   - Update this architecture document

**Files to Modify:**
- Backend: Entity, Service, Controller, Module, DTOs
- Frontend: Components, Hooks, Pages, Routes
- Database: Migration files

**Testing Requirements:**
- Unit tests for business logic
- Integration tests for API endpoints
- E2E tests for critical user flows

**Documentation Requirements:**
- API endpoint documentation
- Component documentation
- User guide updates

### 11.2 Database Changes

**Migration Strategy:**
1. Create migration file with timestamp
2. Write `up()` method for schema changes
3. Write `down()` method for rollback
4. Test migration on development database
5. Run migration in staging
6. Run migration in production

**Schema Modification Process:**
- Never modify existing migrations
- Always create new migrations
- Test backward compatibility
- Plan data migration if needed

**Data Seeding Approach:**
- Seed files for initial data
- Factory pattern for test data
- Seed scripts in package.json

### 11.3 API Development

**New Endpoint Creation Process:**
1. Define endpoint in controller
2. Create DTOs for request/response
3. Add validation decorators
4. Implement service method
5. Add authentication/authorization guards
6. Test with Postman/curl
7. Document endpoint

**Documentation Requirements:**
- Endpoint URL and method
- Request/response schemas
- Authentication requirements
- Example requests/responses
- Error responses

**Testing and Validation:**
- Unit tests for service
- Integration tests for endpoint
- Validation tests for DTOs
- Error handling tests

### 11.4 Frontend Development

**New Component Creation Guidelines:**
1. Create component file
2. Define TypeScript interfaces for props
3. Implement component logic
4. Add styling with TailwindCSS
5. Add error handling
6. Test component in isolation

**State Management Integration:**
- Use React Query for server state
- Use Context for global state
- Use local state for component state
- Avoid prop drilling

**Styling Approach:**
- TailwindCSS utility classes
- Component-specific styles in component file
- Global styles in globals.css
- Dark mode support

---

## 12. Testing Strategy

### 12.1 Testing Frameworks Used

**Backend:**
- **Jest:** Test runner and assertion library
- **Supertest:** HTTP endpoint testing
- **TypeORM Testing:** Database testing utilities

**Frontend:**
- **Jest:** Test runner
- **React Testing Library:** Component testing
- **Jest DOM:** DOM matchers

### 12.2 Unit Testing Approach

**Backend:**
- Test services in isolation
- Mock dependencies
- Test business logic
- Test error cases

**Frontend:**
- Test components in isolation
- Mock API calls
- Test user interactions
- Test edge cases

### 12.3 Integration Testing Approach

**Backend:**
- Test API endpoints end-to-end
- Use test database
- Test authentication flow
- Test authorization

**Frontend:**
- Test component integration
- Test hook usage
- Test context providers

### 12.4 E2E Testing Strategy

**Current Status:**
- Basic E2E tests in `/test` directory
- Needs expansion

**Future Plans:**
- Playwright or Cypress for E2E
- Critical user flows
- Cross-browser testing

### 12.5 Test Coverage Goals

**Current Coverage:**
- Limited coverage (estimated < 30%)

**Target Coverage:**
- Backend services: 80%+
- Controllers: 70%+
- Frontend components: 60%+
- Critical paths: 90%+

---

## 13. Deployment & Operations

### 13.1 Environment Configurations

**Development:**
- Backend: `http://localhost:3000`
- Frontend: `http://localhost:3001`
- Database: Local PostgreSQL
- Redis: Local instance

**Staging:**
- Similar to production
- Test data
- Monitoring enabled

**Production:**
- HTTPS required
- Environment variables configured
- Database replication
- Redis cluster
- Monitoring and logging

### 13.2 Deployment Process

**Current Process:**
- Manual deployment
- `start.sh` script for local development

**Future Process:**
- Docker containers
- Kubernetes orchestration
- CI/CD pipeline
- Automated deployments

### 13.3 Monitoring and Logging

**Current Monitoring:**
- Basic console logging
- Error logging in services

**Future Monitoring:**
- APM (Application Performance Monitoring)
- Error tracking (Sentry)
- Log aggregation (ELK stack)
- Metrics dashboard (Grafana)

### 13.4 Backup and Recovery Strategy

**Database Backups:**
- Automated daily backups
- Point-in-time recovery
- Backup retention policy

**File Backups:**
- Uploaded files backed up
- Version control for important files

**Recovery Procedures:**
- Documented recovery steps
- Regular recovery drills
- Disaster recovery plan

---

## 14. Dependencies & Package Management

### 14.1 Key Backend Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @nestjs/common | ^11.0.1 | NestJS core |
| @nestjs/core | ^11.0.1 | NestJS core |
| @nestjs/typeorm | ^11.0.0 | TypeORM integration |
| @nestjs/jwt | ^11.0.0 | JWT authentication |
| @nestjs/passport | ^11.0.5 | Authentication strategies |
| @nestjs/websockets | ^11.1.3 | WebSocket support |
| @nestjs/platform-socket.io | ^11.1.3 | Socket.io integration |
| typeorm | ^0.3.24 | ORM |
| pg | ^8.16.0 | PostgreSQL driver |
| ioredis | ^5.8.0 | Redis client |
| passport-jwt | ^4.0.1 | JWT strategy |
| bcryptjs | ^3.0.2 | Password hashing |
| socket.io | ^4.8.1 | WebSocket library |
| class-validator | ^0.14.2 | Validation |
| class-transformer | ^0.5.1 | Transformation |
| speakeasy | ^2.0.0 | 2FA TOTP |
| @node-saml/passport-saml | ^5.1.0 | SAML SSO |

### 14.2 Key Frontend Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| next | 15.3.3 | Next.js framework |
| react | ^18.2.0 | React library |
| react-dom | ^18.2.0 | React DOM |
| @tanstack/react-query | ^5.80.10 | Server state management |
| react-hook-form | ^7.58.1 | Form management |
| zod | ^3.25.67 | Schema validation |
| tailwindcss | ^3.4.17 | CSS framework |
| @headlessui/react | ^2.2.4 | UI components |
| lucide-react | ^0.544.0 | Icons |
| socket.io-client | ^4.8.1 | WebSocket client |
| recharts | ^2.15.4 | Charts |
| @dnd-kit/core | ^6.3.1 | Drag and drop |
| date-fns | ^4.1.0 | Date utilities |

### 14.3 Update and Maintenance Strategy

**Update Frequency:**
- Security updates: Immediately
- Minor updates: Monthly
- Major updates: Quarterly (with testing)

**Update Process:**
1. Check for security vulnerabilities
2. Test updates in development
3. Update dependencies
4. Run tests
5. Deploy to staging
6. Deploy to production

### 14.4 Security Vulnerability Monitoring

**Tools:**
- `npm audit` for vulnerability scanning
- Dependabot (GitHub) for automated updates
- Snyk for security monitoring

**Process:**
- Regular vulnerability scans
- Immediate patching for critical issues
- Testing before deployment

---

## 15. Performance Considerations

### 15.1 Current Performance Metrics

**Backend:**
- API response time: < 200ms average
- Database query time: < 50ms average
- WebSocket latency: < 100ms

**Frontend:**
- Initial load time: ~2-3 seconds
- Time to interactive: ~3-4 seconds
- Bundle size: ~500KB (gzipped)

### 15.2 Optimization Strategies Implemented

**Backend:**
- Database connection pooling
- Query optimization with indexes
- Redis caching
- Response compression
- Connection pooling configuration

**Frontend:**
- Code splitting
- Image optimization
- Lazy loading
- Bundle optimization
- Service worker for caching

### 15.3 Areas for Improvement

1. **Database:**
   - Query optimization
   - N+1 query elimination
   - Query result caching

2. **Frontend:**
   - Further code splitting
   - Prefetching critical resources
   - Virtual scrolling for large lists

3. **Infrastructure:**
   - CDN integration
   - Load balancing
   - Database read replicas

### 15.4 Caching Strategies

**Current Caching:**
- Redis for session storage
- React Query for API response caching
- Service worker for static assets

**Future Caching:**
- Database query result caching
- CDN for static assets
- API response caching headers
- Browser caching strategies

---

## 16. Glossary

### Technical Terms

- **API:** Application Programming Interface
- **JWT:** JSON Web Token - authentication token format
- **RBAC:** Role-Based Access Control
- **ORM:** Object-Relational Mapping (TypeORM)
- **DTO:** Data Transfer Object
- **SSO:** Single Sign-On
- **2FA:** Two-Factor Authentication
- **TOTP:** Time-based One-Time Password
- **SAML:** Security Assertion Markup Language
- **WebSocket:** Real-time bidirectional communication protocol
- **REST:** Representational State Transfer - API architecture style
- **GraphQL:** Query language for APIs (future)
- **CDN:** Content Delivery Network
- **APM:** Application Performance Monitoring
- **CI/CD:** Continuous Integration/Continuous Deployment

### Domain-Specific Terminology

- **Issue:** A task, bug, story, or epic in the system
- **Sprint:** A time-boxed iteration in agile development
- **Board:** A Kanban-style board for visualizing issues
- **Epic:** A large feature or user story
- **Story:** A user story (smaller than epic)
- **Backlog:** A prioritized list of work items
- **Release:** A planned product release
- **Project:** A container for issues, sprints, and team members
- **Watcher:** A user who receives notifications about an issue
- **Automation Rule:** A rule that triggers actions based on events
- **Workflow:** A defined process for issue status transitions
- **Integration:** Connection to external service (GitHub, Jira, etc.)
- **Resource Allocation:** Assignment of team members to projects/tasks
- **Capacity Planning:** Planning team member availability

### Project-Specific Conventions

- **Project Key:** Unique uppercase identifier for a project (e.g., "PROJ")
- **Issue Status:** Current state of an issue (To Do, In Progress, Done, etc.)
- **Issue Priority:** Priority level (Highest, High, Medium, Low, Lowest)
- **Issue Type:** Category of issue (Epic, Story, Task, Bug, Sub-task)
- **Story Points:** Effort estimation for agile planning
- **Backlog Order:** Priority order in backlog
- **Smart Defaults:** System-learned preferences for user behavior
- **Progressive Disclosure:** Showing features gradually based on user experience

---

## 17. Change Log

### Version 1.0.0 (January 2025)
- Initial architecture document creation
- Comprehensive system analysis
- Documentation of all major features
- Current state assessment
- Future roadmap planning

### Major Updates History
- **Phase 1:** Intelligent Onboarding System (Complete)
- **Phase 2:** Workflow Automation (Complete)
- **Phase 3:** Resource Management (Complete)
- **Phase 4:** Integrations (Complete)

---

## Notes for AI Assistants

This document serves as the **source of truth** for the Zenith project architecture. When writing new code:

1. **Always reference this document** to understand context
2. **Follow established patterns** and conventions
3. **Update this document** when making architectural changes
4. **Ensure new features align** with the existing architecture
5. **Consider the future roadmap** when making design decisions

### Key Principles to Follow:

- **Type Safety:** Always use proper TypeScript types, avoid `any`
- **Consistency:** Follow existing code patterns and structure
- **Documentation:** Update relevant sections when adding features
- **Testing:** Write tests for new features
- **Security:** Always validate inputs and authenticate requests
- **Performance:** Consider performance implications of new code

### When Making Changes:

1. Check if the change affects architecture
2. Update relevant sections of this document
3. Ensure consistency with existing patterns
4. Test thoroughly before committing
5. Document any breaking changes

---

**Document Status:** ✅ Complete and Current  
**Maintained By:** Development Team  
**Review Frequency:** Quarterly or on major changes

---

*This is a living document. As the Zenith project evolves, this architecture documentation should be updated to reflect the current state and future direction of the system.*

