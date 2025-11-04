#!/bin/bash

# Kill any running instances
echo "Stopping any running instances..."
pkill -f "npm run start:dev" || true
pkill -f "npm run dev" || true

# Start backend on port 3000
echo "Starting backend on port 3000..."
cd "$(dirname "$0")/backend" && PORT=3000 npm run start:dev &
BACKEND_PID=$!

# Wait for backend to initialize
echo "Waiting for backend to initialize..."
sleep 5

# Start frontend on port 3001
echo "Starting frontend on port 3001..."
cd "$(dirname "$0")/frontend" && npm run dev &
FRONTEND_PID=$!

# Function to handle script termination
cleanup() {
  echo "Stopping services..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  exit 0
}

# Register the cleanup function for SIGINT and SIGTERM
trap cleanup SIGINT SIGTERM

echo "Services started:"
echo "- Backend: http://localhost:3000"
echo "- Frontend: http://localhost:3001"
echo "Press Ctrl+C to stop all services"

# Keep the script running
wait
