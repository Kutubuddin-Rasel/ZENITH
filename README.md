<div align="center">

  <h1>Zenith</h1>
  
  <p>
    <strong>The Enterprise-Grade Project Management SaaS (Jira Alternative)</strong>
  </p>

  <p>
    <a href="https://github.com/Kutubuddin-Rasel/ZENITH/actions"><img src="https://img.shields.io/github/actions/workflow/status/Kutubuddin-Rasel/ZENITH/ci.yml?style=flat-square" alt="Build Status"></a>
    <a href="https://img.shields.io/npm/v/npm.svg?style=flat-square"><img src="https://img.shields.io/npm/v/npm.svg?style=flat-square" alt="Version"></a>
    <a href="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
    <a href="https://github.com/nestjs/nest"><img src="https://img.shields.io/badge/backend-NestJS-E0234E?style=flat-square" alt="Backend"></a>
    <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/frontend-Next.js-black?style=flat-square" alt="Frontend"></a>
  </p>

  <p>
    <i>Manage projects, track issues, and leverage AI to build better software—faster.</i>
  </p>
  
</div>

## Introduction

**Zenith** is a modern, open-source project management platform designed to compete with industry giants like Jira and Linear. It combines the flexibility of agile methodologies with the power of **Artificial Intelligence** to streamline workflows.

Unlike traditional tools that feel clunky and slow, Zenith is built for **speed** and **intelligence**. From intelligent project setup wizards to RAG-powered "Ask Your Project" capabilities, Zenith helps teams focus on shipping code, not managing tickets.

## Key Features

### Zenith Intelligence (AI)
*   **Smart Setup**: Chat with our AI to auto-configure your project (Scrum vs. Kanban, customized columns) based on your team's size and goals.
*   **Ask Your Project (RAG)**: Stop searching through thousands of tickets. Just ask: *"What is the status of the mobile app?"* or *"Who is working on the payment integration?"*
*   **Predictive Analytics**: AI-scored templates and sprint risk analysis to keep your delivery on track.
*   **Generative Tools**: AI-powered project name generation and requirements clarification.

### Powerhouse Management
*   **Agile Boards**: Drag-and-drop Kanban and Scrum boards optimized for performance (rendering thousands of issues smoothly).
*   **Issue Tracking**: Comprehensive filtering, custom fields, atomic drag-and-drop, and detailed history logs.
*   **Workflows**: Flexible state transitions to match your team's process.
*   **Time Tracking**: Built-in work logs with notes and minutes spent.

### Enterprise SaaS
*   **Workspaces**: Fully isolated organizations with slug-based access.
*   **Team Management**: Role-based access (RBAC) and email invitations.
*   **Billing**: Integrated Stripe subscriptions and invoices.
*   **Audit Logs**: ClickHouse-backed security logs for full compliance visibility.

### Integrations & Connectivity
*   **GitHub**: Link issues to Pull Requests and sync statuses automatically.
*   **Slack & Teams**: Get real-time notifications where your team works.
*   **Importers**: Seamlessly migrate issues from Jira and Trello.

### Security & Compliance
*   **Authentication**: Secure session management and Two-Factor Authentication (2FA).
*   **Data Isolation**: Strict multi-tenancy enforced at the database level using `TenantContext`.

### Real-Time & Collaboration
*   **Live Updates**: Instant reflection of changes across all clients via Socket.io.
*   **Notifications**: Intelligent email alerts via Resend.
*   **Observability**: Integrated Prometheus and Grafana dashboards for real-time monitoring.

## Tech Stack

**Backend**
*   **Framework**: [NestJS](https://nestjs.com/) (v11)
*   **Database**: PostgreSQL (Primary), Redis (Queues/Cache), ClickHouse (Analytics)
*   **Language**: TypeScript

**Frontend**
*   **Framework**: [Next.js](https://nextjs.org/) (v15 App Router)
*   **Styling**: Tailwind CSS
*   **State**: React Query & Zustand

**Infrastructure**
*   **Containerization**: Docker & Docker Compose
*   **CI/CD**: GitHub Actions

## Getting Started

Follow these steps to get a local copy up and running.

### Prerequisites
*   Docker & Docker Compose
*   Node.js (v20+) & npm (for local development)

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/Kutubuddin-Rasel/ZENITH.git
    cd ZENITH
    ```

2.  **Set up Environment Variables**
    Copy the example `.env` file in the `backend` directory.
    ```bash
    cp backend/.env.example backend/.env
    # Update necessary keys (Project is pre-configured with defaults for local dev)
    ```

3.  **Start with Docker**
    Run the entire stack (Database, Backend, Frontend) with one command.
    ```bash
    docker-compose up -d
    ```

4.  **Access the App**
    *   Frontend: `http://localhost:3001`
    *   Backend API: `http://localhost:3000`
    *   API Docs (Swagger): `http://localhost:3000/api`

## Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## License

Distributed under the MIT License. See `LICENSE` for more information.

## Contact

Kutubuddin Rasel - [@kutubuddin_rasel](https://twitter.com/kutubuddin_rasel) - contact@zenith.com

Project Link: [https://github.com/Kutubuddin-Rasel/ZENITH](https://github.com/Kutubuddin-Rasel/ZENITH)
