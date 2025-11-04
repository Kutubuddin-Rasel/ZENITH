# Port Configuration for Zenith

This document describes the port configuration for the Zenith application.

## Port Assignments

The application uses the following port assignments:

- **Backend API**: Running on port `3000`
- **Frontend Web**: Running on port `3001`

## Starting the Application

### Using the Start Script

The easiest way to start both services with the correct port configuration is to use the provided start script:

```bash
./start.sh
```

This script will:
1. Stop any running instances
2. Start the backend on port 3000
3. Start the frontend on port 3001
4. Provide URLs for accessing both services

### Manual Start

If you prefer to start the services manually:

#### Backend (NestJS)

```bash
cd backend
PORT=3000 npm run start:dev
```

#### Frontend (Next.js)

```bash
cd frontend
npm run dev
```

The frontend is configured to run on port 3001 via the package.json scripts.

## API URL Configuration

The frontend is configured to connect to the backend API at `http://localhost:3000`. This is set in multiple places:

1. In `frontend/next.config.ts` as an environment variable
2. In API fetch utilities (`src/lib/fetcher.ts`)
3. In WebSocket connections (`src/lib/socket.ts`)
4. In various components that make direct API calls

## Environment Variables

If you need to modify the port configuration, you can create the following environment files:

### Backend (.env)

```
PORT=3000
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASS=password
DATABASE_NAME=zenith
```

### Frontend (.env.local)

```
NEXT_PUBLIC_API_URL=http://localhost:3000
PORT=3001
```

## Troubleshooting

If you encounter any issues with the port configuration:

1. Check that both ports (3000 and 3001) are available and not used by other applications
2. Verify that the frontend is making API requests to the correct backend URL (http://localhost:3000)
3. Check browser console for any CORS errors, which might indicate a port mismatch
4. Restart both services to ensure they pick up the latest configuration
