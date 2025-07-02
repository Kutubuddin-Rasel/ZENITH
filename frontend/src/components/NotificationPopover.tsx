"use client";
import React, { useState, useRef, useEffect } from 'react';
import { BellIcon, CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { useNotifications, Notification } from '../hooks/useNotifications';
import { useProjectInvites } from '../hooks/useProjectInvites';
import { useToast } from '../context/ToastContext';
import { useRouter } from 'next/navigation';
import Button from './Button';
import Spinner from './Spinner';
import Modal from './Modal';

export default function NotificationPopover() {
  const { notifications, isLoading, markAsRead } = useNotifications();
  const { respondToInviteMutation } = useProjectInvites();
  const { showToast } = useToast();
  const router = useRouter();
  
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'unread' | 'history'>('unread');
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [pendingRejectId, setPendingRejectId] = useState<string | null>(null);
  
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const unreadNotifications = notifications?.filter(n => !n.read) || [];
  const readNotifications = notifications?.filter(n => n.read) || [];
  const unreadCount = unreadNotifications.length;

  // Mark notifications as read when popover opens (but keep actionable notifications unread)
  useEffect(() => {
    if (isOpen && unreadNotifications.length > 0) {
      unreadNotifications.forEach(notification => {
        // Only mark as read if it's not an actionable notification (like pending invites)
        const isActionable = notification.context && notification.context.inviteId;
        const isPendingInvite = isActionable && 
          notification.message.includes('invited to join') && 
          !notification.message.includes('has been revoked') &&
          !notification.message.includes('accepted your invite') &&
          !notification.message.includes('rejected your invite');
        
        // Mark as read if it's not a pending invite
        if (!notification.read && !isPendingInvite) {
          markAsRead.mutate(notification.id);
        }
      });
    }
  }, [isOpen, unreadNotifications, markAsRead]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current && 
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleAccept = (inviteId: string) => {
    setAcceptingId(inviteId);
    respondToInviteMutation.mutate(
      { inviteId, accept: true },
      {
        onSuccess: () => {
          showToast('Invitation accepted successfully! 🎉', 'success');
          const notification = notifications?.find(n => n.context?.inviteId === inviteId);
          if (notification) {
            markAsRead.mutate(notification.id);
          }
        },
        onError: (err) => {
          showToast(`Error accepting invitation: ${(err as Error).message}`, 'error');
        },
        onSettled: () => setAcceptingId(null),
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

  const renderNotification = (notification: Notification) => {
    const isInvite = notification.context && notification.context.inviteId;
    
    // Only show Accept/Reject buttons for pending invitations
    // Check if the message indicates it's a pending invitation (not revoked)
    const isPendingInvite = isInvite && 
      notification.message.includes('invited to join') && 
      !notification.message.includes('has been revoked') &&
      !notification.message.includes('accepted your invite') &&
      !notification.message.includes('rejected your invite');
    
    // Determine notification type and icon
    let icon = <InformationCircleIcon className="h-5 w-5 text-blue-500" />;
    let bgColor = "bg-blue-50 dark:bg-blue-900/20";
    
    if (notification.message.includes('has been revoked')) {
      icon = <ExclamationTriangleIcon className="h-5 w-5 text-orange-500" />;
      bgColor = "bg-orange-50 dark:bg-orange-900/20";
    } else if (notification.message.includes('accepted your invite')) {
      icon = <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      bgColor = "bg-green-50 dark:bg-green-900/20";
    } else if (notification.message.includes('rejected your invite')) {
      icon = <XCircleIcon className="h-5 w-5 text-red-500" />;
      bgColor = "bg-red-50 dark:bg-red-900/20";
    } else if (isPendingInvite) {
      icon = <InformationCircleIcon className="h-5 w-5 text-blue-500" />;
      bgColor = "bg-blue-50 dark:bg-blue-900/20";
    }
    
    return (
      <div key={notification.id} className={`p-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${bgColor}`}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900 dark:text-gray-100 font-medium leading-relaxed">
              {notification.message}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {new Date(notification.createdAt).toLocaleString()}
            </p>
          </div>
          {isPendingInvite && !notification.read && (
            <div className="flex gap-1 flex-shrink-0">
              <Button
                size="sm"
                className="text-xs px-2 py-1"
                loading={acceptingId === notification.context!.inviteId}
                disabled={acceptingId === notification.context!.inviteId || rejectingId === notification.context!.inviteId}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleAccept(notification.context!.inviteId!);
                }}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="danger"
                className="text-xs px-2 py-1"
                loading={rejectingId === notification.context!.inviteId}
                disabled={acceptingId === notification.context!.inviteId || rejectingId === notification.context!.inviteId}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRejectClick(notification.context!.inviteId!);
                }}
              >
                Reject
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  function forceRefresh() {
    throw new Error('Function not implemented.');
  }

  return (
    <>
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
        >
          <BellIcon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold min-w-[18px] flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {isOpen && (
          <div
            ref={popoverRef}
            className="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 max-h-96 overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Notifications
                </h3>
                <button
                  onClick={() => {
                    forceRefresh();
                    console.log('🔄 Manually refreshing notifications...');
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="Refresh notifications"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
              
              {/* Tabs */}
              <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                <button
                  onClick={() => setActiveTab('unread')}
                  className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                    activeTab === 'unread'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  Unread ({unreadCount})
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                    activeTab === 'history'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  History ({readNotifications.length})
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="max-h-64 overflow-y-auto">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner className="h-6 w-6" />
                </div>
              ) : activeTab === 'unread' ? (
                unreadNotifications.length > 0 ? (
                  unreadNotifications.map(renderNotification)
                ) : (
                  <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                    <BellIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No unread notifications</p>
                  </div>
                )
              ) : (
                readNotifications.length > 0 ? (
                  readNotifications.map(renderNotification)
                ) : (
                  <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                    <BellIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No notification history</p>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rejection Reason Modal */}
      <Modal open={showRejectModal} onClose={handleRejectCancel}>
        <div className="p-6">
          <h3 className="text-lg font-bold mb-4">Reject Invitation</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Please provide a reason for rejecting this invitation.
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g., Too busy, Not interested, Wrong role..."
            rows={3}
            className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm dark:text-white border-gray-200 dark:border-gray-700 transition-all duration-300 placeholder-gray-400 dark:placeholder-gray-500 hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 shadow-sm hover:shadow-md focus:shadow-lg resize-none"
          />
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
    </>
  );
}
