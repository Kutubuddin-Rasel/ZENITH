import React from 'react';
import Link from 'next/link';
import Button from './Button';
import {
    CheckCircleIcon,
    XCircleIcon,
    InformationCircleIcon,
    ExclamationTriangleIcon,
    EnvelopeIcon,
    ClockIcon
} from '@heroicons/react/24/outline';
import { Notification } from '../hooks/useNotifications';

interface NotificationCardProps {
    notification: Notification;
    onAccept?: (inviteId: string) => void;
    onReject?: (inviteId: string) => void;
    onMarkAsRead?: (id: string) => void;
    isAccepting?: boolean;
    isRejecting?: boolean;
    isMarkingRead?: boolean;
}

export default function NotificationCard({
    notification,
    onAccept,
    onReject,
    onMarkAsRead,
    isAccepting,
    isRejecting,
    isMarkingRead
}: NotificationCardProps) {
    const isInvite = notification.context && notification.context.inviteId;
    const isRead = notification.read;

    const getIcon = () => {
        if (isInvite) return <EnvelopeIcon className="h-6 w-6 text-blue-500" />;

        switch (notification.type) {
            case 'success':
                return <CheckCircleIcon className="h-6 w-6 text-green-500" />;
            case 'error':
                return <XCircleIcon className="h-6 w-6 text-red-500" />;
            case 'warning':
                return <ExclamationTriangleIcon className="h-6 w-6 text-yellow-500" />;
            default:
                return <InformationCircleIcon className="h-6 w-6 text-blue-500" />;
        }
    };

    const getBorderColor = () => {
        if (isInvite) return 'border-l-blue-500';

        switch (notification.type) {
            case 'success':
                return 'border-l-green-500';
            case 'error':
                return 'border-l-red-500';
            case 'warning':
                return 'border-l-yellow-500';
            default:
                return 'border-l-blue-500';
        }
    };

    const getLink = () => {
        if (notification.context?.issueId && notification.context?.projectId) {
            return `/projects/${notification.context.projectId}/issues/${notification.context.issueId}`;
        }
        if (notification.context?.projectId) {
            return `/projects/${notification.context.projectId}`;
        }
        return '#';
    };

    const content = (
        <div className={`relative bg-white dark:bg-neutral-800 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 p-4 transition-all duration-200 hover:shadow-md ${!isRead ? `border-l-4 ${getBorderColor()}` : 'opacity-75'}`}>
            <div className="flex gap-4">
                <div className="flex-shrink-0 mt-1">
                    {getIcon()}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm ${!isRead ? 'font-semibold text-neutral-900 dark:text-neutral-100' : 'text-neutral-600 dark:text-neutral-400'}`}>
                            {notification.message}
                        </p>
                        <div className="flex items-center text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                            <ClockIcon className="h-3 w-3 mr-1" />
                            {new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>

                    {isInvite && !isRead && (
                        <div className="mt-3 flex gap-2">
                            <Button
                                size="sm"
                                variant="primary"
                                onClick={(e) => {
                                    e.preventDefault();
                                    onAccept?.(notification.context!.inviteId!);
                                }}
                                loading={isAccepting}
                                disabled={isRejecting}
                            >
                                Accept
                            </Button>
                            <Button
                                size="sm"
                                variant="danger"
                                onClick={(e) => {
                                    e.preventDefault();
                                    onReject?.(notification.context!.inviteId!);
                                }}
                                loading={isRejecting}
                                disabled={isAccepting}
                            >
                                Reject
                            </Button>
                        </div>
                    )}

                    {!isInvite && !isRead && onMarkAsRead && (
                        <div className="mt-2">
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    onMarkAsRead(notification.id);
                                }}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                                disabled={isMarkingRead}
                            >
                                Mark as read
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const link = getLink();
    if (link !== '#') {
        return <Link href={link} className="block">{content}</Link>;
    }

    return content;
}
