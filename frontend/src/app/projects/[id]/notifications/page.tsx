"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Card from "@/components/Card";
import Spinner from "@/components/Spinner";
import Button from "@/components/Button";
import { useProjectNotifications } from "@/hooks/useNotifications";
import { getSocket } from "@/lib/socket";
import { useProjectInvites } from '@/hooks/useProjectInvites';
import { useToast } from '@/context/ToastContext';

export default function ProjectNotificationsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { notifications, isLoading, isError, markAsRead } = useProjectNotifications(projectId);
  const { respondToInvite } = useProjectInvites();
  const { showToast } = useToast();
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // Real-time updates: refetch on notification
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (notification: { message: string; context?: { projectId?: string } }) => {
      if (notification?.context?.projectId === projectId) {
        window.location.reload(); // simplest way to refetch for now
      }
    };
    socket.on('notification', handler);
    return () => { socket.off('notification', handler); };
  }, [projectId]);

  const handleAccept = (inviteId: string) => {
    setAcceptingId(inviteId);
    respondToInvite(
      { inviteId, accept: true },
      {
        onSuccess: () => showToast('Invite accepted!', 'success'),
        onError: (err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : 'Failed to accept invite';
          showToast(errorMessage, 'error');
        },
        onSettled: () => setAcceptingId(null),
      }
    );
  };

  const handleReject = (inviteId: string) => {
    setRejectingId(inviteId);
    respondToInvite(
      { inviteId, accept: false, reason: rejectReason },
      {
        onSuccess: () => showToast('Invite rejected.', 'success'),
        onError: (err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : 'Failed to reject invite';
          showToast(errorMessage, 'error');
        },
        onSettled: () => {
          setRejectingId(null);
          setRejectReason("");
        },
      }
    );
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Project Notifications</h2>
      <Card>
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>
        ) : isError ? (
          <div className="text-red-500 text-center py-8">Failed to load notifications.</div>
        ) : notifications.length === 0 ? (
          <div className="text-gray-400 text-center py-8">No notifications for this project.</div>
        ) : (
          <ul>
            {notifications.map((n) => {
              const isInvite = n.context && n.context.inviteId;
              return (
                <li key={n.id} className={`flex items-center gap-3 p-4 border-b last:border-b-0 border-gray-100 dark:border-gray-800 ${n.read ? 'opacity-60' : ''}`}>
                  <span className={`text-xs px-2 py-1 rounded ${n.type === 'error' ? 'bg-red-100 text-red-700' : n.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{n.type || 'info'}</span>
                  <span className="flex-1">{n.message}</span>
                  <span className="text-xs text-gray-400">{new Date(n.createdAt).toLocaleString()}</span>
                  {isInvite && !n.read && (
                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                      <Button
                        size="xs"
                        loading={acceptingId === n.context!.inviteId}
                        disabled={acceptingId === n.context!.inviteId || rejectingId === n.context!.inviteId}
                        onClick={() => handleAccept(n.context!.inviteId!)}
                      >
                        Accept
                      </Button>
                      <Button
                        size="xs"
                        variant="danger"
                        loading={rejectingId === n.context!.inviteId}
                        disabled={acceptingId === n.context!.inviteId || rejectingId === n.context!.inviteId}
                        onClick={() => {
                          if (rejectingId === n.context!.inviteId) return;
                          const reason = prompt("Optionally provide a reason for rejecting this invite:");
                          setRejectReason(reason || "");
                          handleReject(n.context!.inviteId!);
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                  {!isInvite && !n.read && (
                    <Button size="xs" variant="secondary" onClick={() => markAsRead.mutate(n.id)}>
                      Mark as read
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
} 