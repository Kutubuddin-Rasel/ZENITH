"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import { BellIcon } from '@heroicons/react/24/outline';
import { useNotifications } from '../hooks/useNotifications';

const NotificationBell = () => {
  const { notifications } = useNotifications();
  const router = useRouter();
  const unread = notifications?.filter((n) => !n.read).length || 0;

  return (
    <button
      className="relative p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-accent-blue transition"
      aria-label="Notifications"
      onClick={() => router.push('/notifications')}
    >
      <BellIcon className="h-6 w-6 text-neutral-700 dark:text-neutral-200" />
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 bg-accent-blue text-white text-xs rounded-full px-1.5 py-0.5 font-bold">
          {unread}
        </span>
      )}
    </button>
  );
};

export default NotificationBell; 