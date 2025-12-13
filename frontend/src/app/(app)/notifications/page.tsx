"use client";
import React, { useState } from "react";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import Modal from "@/components/Modal";
import NotificationCard from "@/components/NotificationCard";
import { useNotifications, Notification } from "@/hooks/useNotifications";
import { useProjectInvites } from "@/hooks/useProjectInvites";
import { useToast } from "@/context/ToastContext";
import { useQueryClient } from "@tanstack/react-query";
import { BellIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

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

  // Group notifications by date
  const groupedNotifications = React.useMemo(() => {
    if (!notifications) return {};

    const groups: Record<string, Notification[]> = {
      'Today': [],
      'Yesterday': [],
      'Earlier this week': [],
      'Older': []
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    notifications.forEach(notification => {
      const date = new Date(notification.createdAt);
      date.setHours(0, 0, 0, 0);

      if (date.getTime() === today.getTime()) {
        groups['Today'].push(notification);
      } else if (date.getTime() === yesterday.getTime()) {
        groups['Yesterday'].push(notification);
      } else if (date > weekAgo) {
        groups['Earlier this week'].push(notification);
      } else {
        groups['Older'].push(notification);
      }
    });

    // Remove empty groups
    Object.keys(groups).forEach(key => {
      if (groups[key].length === 0) delete groups[key];
    });

    return groups;
  }, [notifications]);

  const handleAccept = (inviteId: string) => {
    setAcceptingId(inviteId);

    respondToInviteMutation.mutate(
      { inviteId, accept: true },
      {
        onSuccess: () => {
          showToast('Invitation accepted successfully! 🎉', 'success');
          const notification = notifications?.find(n => n.context?.inviteId === inviteId);
          if (notification) {
            markAsRead.mutate(notification.id, {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: ['notifications'] });
              }
            });
          }
        },
        onError: (err) => {
          showToast(`Error accepting invitation: ${(err as Error).message}`, 'error');
        },
        onSettled: () => {
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
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <BellIcon className="h-8 w-8 text-blue-600" />
            Notifications
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Stay updated with your project activities
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => markAllAsRead.mutate()}
            loading={markAllAsRead.isPending}
            className="flex items-center gap-2"
          >
            <CheckCircleIcon className="h-4 w-4" />
            Mark all as read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-blue-600" />
        </div>
      ) : isError ? (
        <div className="text-center py-12 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
          <p className="text-red-600 dark:text-red-400 font-medium">Failed to load notifications</p>
          <Button variant="secondary" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['notifications'] })} className="mt-4">
            Try Again
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {(!notifications || notifications.length === 0) ? (
            <div className="text-center py-20 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700">
              <div className="bg-white dark:bg-neutral-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                <BellIcon className="h-8 w-8 text-neutral-400" />
              </div>
              <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">No notifications yet</h3>
              <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                When you get notifications, they&apos;ll show up here
              </p>
            </div>
          ) : (
            Object.entries(groupedNotifications).map(([group, items]) => (
              <div key={group} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h3 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-4 pl-1">
                  {group}
                </h3>
                <div className="space-y-3">
                  {items.map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onAccept={handleAccept}
                      onReject={handleRejectClick}
                      onMarkAsRead={(id) => markAsRead.mutate(id)}
                      isAccepting={acceptingId === notification.context?.inviteId}
                      isRejecting={rejectingId === notification.context?.inviteId}
                      isMarkingRead={markAsRead.isPending}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Rejection Reason Modal */}
      <Modal open={showRejectModal} onClose={handleRejectCancel} title="Reject Invitation">
        <div className="space-y-4">
          <p className="text-neutral-600 dark:text-neutral-400">
            Please provide a reason for rejecting this invitation. This helps the project team understand your decision.
          </p>
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Reason for rejection
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Too busy, Not interested, Wrong role..."
              rows={3}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
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