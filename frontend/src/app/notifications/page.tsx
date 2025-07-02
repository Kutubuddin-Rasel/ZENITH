"use client";
import React, { useState } from "react";
import Link from "next/link";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Spinner from "../../components/Spinner";
import Modal from "../../components/Modal";
import Input from "../../components/Input";
import { useNotifications, Notification } from "../../hooks/useNotifications";
import { useProjectInvites } from "@/hooks/useProjectInvites";
import { useToast } from "@/context/ToastContext";
import { useQueryClient } from "@tanstack/react-query";

export default function NotificationsPage() {
  const { notifications, isLoading, isError, markAsRead, markAllAsRead } = useNotifications();
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [pendingRejectId, setPendingRejectId] = useState<string | null>(null);
  const { respondToInviteMutation } = useProjectInvites();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  // Debug logging
  console.log('🔍 NotificationsPage: Current state:', {
    notifications,
    isLoading,
    isError,
    unreadCount,
    token: typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
  });

  const getNotificationLink = (notification: Notification) => {
    if (notification.context?.issueId && notification.context?.projectId) {
      return `/projects/${notification.context.projectId}/issues/${notification.context.issueId}`;
    }
    if (notification.context?.projectId) {
      return `/projects/${notification.context.projectId}`;
    }
    return '#'; // Return a non-navigable link if no context
  }

  const handleAccept = (inviteId: string) => {
    console.log('🔍 handleAccept: Starting with inviteId:', inviteId);
    console.log('🔍 handleAccept: Current notifications:', notifications);
    setAcceptingId(inviteId);
    
    console.log('🔍 handleAccept: About to call respondToInviteMutation.mutate');
    respondToInviteMutation.mutate(
      { inviteId, accept: true },
      {
        onSuccess: (data) => {
          console.log('✅ respondToInviteMutation: onSuccess called with data:', data);
          showToast('Invitation accepted successfully! 🎉', 'success');
          // Mark the notification as read after accepting
          console.log('🔍 handleAccept: Looking for notification with inviteId:', inviteId);
          console.log('🔍 handleAccept: Available notifications:', notifications?.map(n => ({
            id: n.id,
            inviteId: n.context?.inviteId,
            message: n.message
          })));
          const notification = notifications?.find(n => n.context?.inviteId === inviteId);
          console.log('🔍 handleAccept Debug:', {
            inviteId,
            notification,
            notificationsCount: notifications?.length,
            foundNotification: !!notification
          });
          if (notification) {
            console.log('✅ Marking notification as read:', notification.id);
            markAsRead.mutate(notification.id, {
              onSuccess: () => {
                console.log('✅ Notification marked as read successfully');
                // Force a manual refresh of notifications
                queryClient.invalidateQueries({ queryKey: ['notifications'] });
              },
              onError: (error) => {
                console.error('❌ Error marking notification as read:', error);
              }
            });
          } else {
            console.error('❌ Notification not found for inviteId:', inviteId);
            console.error('❌ Available inviteIds:', notifications?.map(n => n.context?.inviteId));
          }
        },
        onError: (err) => {
          console.error('❌ respondToInviteMutation: onError called with error:', err);
          showToast(`Error accepting invitation: ${(err as Error).message}`, 'error');
        },
        onSettled: () => {
          console.log('🔍 respondToInviteMutation: onSettled called');
          setAcceptingId(null);
        },
      }
    );
  };

  const handleRejectClick = (inviteId: string) => {
    setPendingRejectId(inviteId);
    setShowRejectModal(true);
  };

  const handleRejectConfirm = () => {
    if (!pendingRejectId) return;
    
    setRejectingId(pendingRejectId);
    respondToInviteMutation.mutate(
      { inviteId: pendingRejectId, accept: false, reason: rejectReason },
      {
        onSuccess: () => {
          showToast('Invitation rejected successfully', 'info');
          setShowRejectModal(false);
          setRejectReason("");
          setPendingRejectId(null);
          // Mark the notification as read after rejecting
          const notification = notifications?.find(n => n.context?.inviteId === pendingRejectId);
          if (notification) {
            markAsRead.mutate(notification.id);
          }
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
        onError: (err) => {
          showToast(`Error rejecting invitation: ${(err as Error).message}`, 'error');
        },
        onSettled: () => {
          setRejectingId(null);
        },
      }
    );
  };

  const handleRejectCancel = () => {
    setShowRejectModal(false);
    setRejectReason("");
    setPendingRejectId(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Notifications</h2>
        {unreadCount > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => markAllAsRead.mutate()}
            loading={markAllAsRead.isPending}
          >
            Mark all as read
          </Button>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : isError ? (
        <div className="text-red-500">Failed to load notifications.</div>
      ) : (
        <div className="space-y-4">
          {(!notifications || notifications.length === 0) && (
            <div className="bg-white dark:bg-background-dark rounded-lg shadow-card p-8 text-center text-gray-500 dark:text-gray-400">
              No notifications yet.
            </div>
          )}
          {notifications && notifications.map((n) => {
            const isInvite = n.context && n.context.inviteId;
            return (
              <Link key={n.id} href={getNotificationLink(n)} passHref>
                <Card
                  className={`flex flex-col md:flex-row md:items-center gap-2 p-4 transition-all duration-150 ease-in-out hover:shadow-md hover:-translate-y-px cursor-pointer ${!n.read ? 'border-l-4 border-accent-blue' : ''}`}
                >
                  <div className="flex-1">
                    <div className="font-medium mb-1 flex items-center gap-2">
                      {n.type === 'success' && <span className="text-green-600">●</span>}
                      {n.type === 'error' && <span className="text-red-600">●</span>}
                      {n.type === 'info' && <span className="text-accent-blue">●</span>}
                      {n.message}
                    </div>
                    <div className="text-xs text-gray-400 mb-1">{new Date(n.createdAt).toLocaleString()}</div>
                  </div>
                  {isInvite && !n.read && (
                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                      <Button
                        size="sm"
                        loading={acceptingId === n.context!.inviteId}
                        disabled={acceptingId === n.context!.inviteId || rejectingId === n.context!.inviteId}
                        onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAccept(n.context!.inviteId!);
                        }}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={rejectingId === n.context!.inviteId}
                        disabled={acceptingId === n.context!.inviteId || rejectingId === n.context!.inviteId}
                        onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRejectClick(n.context!.inviteId!);
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                  {!isInvite && !n.read && (
                    <Button
                      size="sm"
                      loading={markAsRead.isPending}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        markAsRead.mutate(n.id);
                      }}
                    >
                      Mark as read
                    </Button>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Rejection Reason Modal */}
      <Modal open={showRejectModal} onClose={handleRejectCancel}>
        <div className="p-6">
          <h3 className="text-lg font-bold mb-4">Reject Invitation</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Please provide a reason for rejecting this invitation. This helps the project team understand your decision.
          </p>
          <div className="w-full">
            <label className="block mb-2 font-semibold text-sm bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
              Reason for rejection
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Too busy, Not interested, Wrong role..."
              rows={3}
              className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm dark:text-white border-gray-200 dark:border-gray-700 transition-all duration-300 placeholder-gray-400 dark:placeholder-gray-500 hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 shadow-sm hover:shadow-md focus:shadow-lg resize-none"
            />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={handleRejectCancel}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleRejectConfirm}
              loading={rejectingId === pendingRejectId}
              disabled={!rejectReason.trim()}
            >
              Reject Invitation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
} 