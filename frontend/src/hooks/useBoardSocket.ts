'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Issue } from './useProjectIssues';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

/**
 * Payload for issue movement events (matches backend DTO)
 */
interface SlimIssuePayload {
    id: string;
    title: string;
    number: number | null;
    status: string;
    statusId: string;
    priority: string;
    type: string;
    assigneeId?: string | null;
    lexorank: string;
    storyPoints: number;
    labels?: string[];
}

interface IssueMovedPayload {
    userId: string;
    userName: string;
    timestamp: string;
    issueId: string;
    issue: SlimIssuePayload;
    fromColumnId: string;
    toColumnId: string;
    newIndex: number;
    boardId: string;
    projectId: string;
}

interface IssueCreatedPayload {
    userId: string;
    userName: string;
    timestamp: string;
    issue: SlimIssuePayload;
    columnId: string;
    boardId: string;
    projectId: string;
}

interface IssueDeletedPayload {
    userId: string;
    userName: string;
    timestamp: string;
    issueId: string;
    columnId: string;
    boardId: string;
    projectId: string;
}

// Socket.IO client type
interface BoardSocket {
    on(event: string, listener: (...args: unknown[]) => void): void;
    off(event: string, listener?: (...args: unknown[]) => void): void;
    emit(event: string, ...args: unknown[]): void;
    disconnect(): void;
    connected: boolean;
}

let boardSocket: BoardSocket | null = null;

/**
 * Connect to the boards WebSocket namespace
 */
async function connectBoardSocket(): Promise<BoardSocket | null> {
    if (boardSocket?.connected) return boardSocket;

    try {
        const { default: io } = await import('socket.io-client');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

        boardSocket = io(`${apiUrl}/boards`, {
            withCredentials: true,
            transports: ['websocket'],
        }) as unknown as BoardSocket;

        return boardSocket;
    } catch (error) {
        console.error('Failed to connect to board socket:', error);
        return null;
    }
}

/**
 * Hook to connect to board WebSocket and handle real-time updates
 *
 * This hook:
 * 1. Joins the board room on mount
 * 2. Listens for issue-moved, issue-created, issue-deleted events
 * 3. Updates React Query cache directly (NO refetch)
 * 4. Shows toast notifications for other users' changes
 */
export function useBoardSocket(boardId: string, projectId: string) {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const { showToast } = useToast();
    const socketRef = useRef<BoardSocket | null>(null);

    useEffect(() => {
        if (!boardId) return;

        let mounted = true;

        async function setupSocket() {
            const socket = await connectBoardSocket();
            if (!socket || !mounted) return;

            socketRef.current = socket;

            // Join the board room
            socket.emit('joinBoard', { boardId });

            // Handle issue moved events
            const handleIssueMoved = (payload: IssueMovedPayload) => {
                // Skip if this is our own action (already applied optimistically)
                if (payload.userId === user?.id) return;

                // Update React Query cache directly - NO REFETCH
                queryClient.setQueryData<Issue[]>(
                    ['project-issues', projectId],
                    (oldData) => {
                        if (!oldData) return oldData;

                        // Find and update the moved issue
                        return oldData.map((issue) => {
                            if (issue.id === payload.issueId) {
                                return {
                                    ...issue,
                                    status: payload.issue.status,
                                    statusId: payload.issue.statusId,
                                    lexorank: payload.issue.lexorank,
                                };
                            }
                            return issue;
                        });
                    },
                );

                // Show toast for other user's changes
                showToast(`${payload.userName} moved "${payload.issue.title}"`, 'info');
            };

            // Handle issue created events
            const handleIssueCreated = (payload: IssueCreatedPayload) => {
                if (payload.userId === user?.id) return;

                queryClient.setQueryData<Issue[]>(
                    ['project-issues', projectId],
                    (oldData) => {
                        if (!oldData) return oldData;
                        // Add the new issue
                        return [...oldData, payload.issue as unknown as Issue];
                    },
                );

                showToast(`${payload.userName} created "${payload.issue.title}"`, 'success');
            };

            // Handle issue deleted events
            const handleIssueDeleted = (payload: IssueDeletedPayload) => {
                if (payload.userId === user?.id) return;

                queryClient.setQueryData<Issue[]>(
                    ['project-issues', projectId],
                    (oldData) => {
                        if (!oldData) return oldData;
                        return oldData.filter((issue) => issue.id !== payload.issueId);
                    },
                );

                showToast(`${payload.userName} deleted an issue`, 'info');
            };

            socket.on('issue-moved', handleIssueMoved as (...args: unknown[]) => void);
            socket.on('issue-created', handleIssueCreated as (...args: unknown[]) => void);
            socket.on('issue-deleted', handleIssueDeleted as (...args: unknown[]) => void);

            // Cleanup function
            return () => {
                socket.off('issue-moved', handleIssueMoved as (...args: unknown[]) => void);
                socket.off('issue-created', handleIssueCreated as (...args: unknown[]) => void);
                socket.off('issue-deleted', handleIssueDeleted as (...args: unknown[]) => void);
                socket.emit('leaveBoard', { boardId });
            };
        }

        const cleanupPromise = setupSocket();

        return () => {
            mounted = false;
            cleanupPromise.then((cleanup) => cleanup?.());
        };
    }, [boardId, projectId, queryClient, user?.id, showToast]);

    return socketRef.current;
}
