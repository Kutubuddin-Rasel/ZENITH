"use client";
import React from 'react';
import Card from './Card';
import { CardContent, CardTitle } from './CardComponents';
import Button from './Button';
import Badge from './Badge';
import Alert, { AlertDescription } from './Alert';
import Spinner from './Spinner';
import {
  Shield,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  AlertTriangle,
  Trash2,
  RefreshCw,
  Check,
} from 'lucide-react';
import { useSessions, useRevokeSession, useRevokeAllSessions, UserSession } from '../hooks/useSessions';
import { useToast } from '../context/ToastContext';

interface SessionManagementProps {
  onSessionTerminated?: () => void;
}

/**
 * SessionManagement Component
 * Displays and manages active user sessions with real backend data
 */
export default function SessionManagement({ onSessionTerminated }: SessionManagementProps) {
  const { data, isLoading, error, refetch } = useSessions();
  const { mutate: revokeSession, isPending: isRevoking } = useRevokeSession();
  const { mutate: revokeAllSessions, isPending: isRevokingAll } = useRevokeAllSessions();
  const { showToast } = useToast();

  const handleRevokeSession = (sessionId: string) => {
    revokeSession(sessionId, {
      onSuccess: () => {
        showToast('Session revoked successfully', 'success');
        onSessionTerminated?.();
      },
      onError: (error) => {
        showToast(error.message || 'Failed to revoke session', 'error');
      },
    });
  };

  const handleRevokeAll = () => {
    revokeAllSessions(undefined, {
      onSuccess: (response) => {
        showToast(response.message || 'All other sessions revoked', 'success');
        onSessionTerminated?.();
      },
      onError: (error) => {
        showToast(error.message || 'Failed to revoke sessions', 'error');
      },
    });
  };

  const getDeviceIcon = (session: UserSession) => {
    const deviceType = session.deviceType?.toLowerCase() || '';
    if (deviceType === 'mobile') return <Smartphone className="h-5 w-5" />;
    if (deviceType === 'tablet') return <Tablet className="h-5 w-5" />;
    if (deviceType === 'desktop') return <Monitor className="h-5 w-5" />;
    return <Globe className="h-5 w-5" />;
  };

  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner className="h-6 w-6" />
        <span className="ml-2 text-neutral-600 dark:text-neutral-400">Loading sessions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error.message || 'Failed to load sessions'}</AlertDescription>
      </Alert>
    );
  }

  const sessions = data?.sessions || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Active Sessions</h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Manage your active sessions across devices
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => refetch()} variant="secondary" size="sm" disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {sessions.length > 1 && (
            <Button
              onClick={handleRevokeAll}
              variant="danger"
              size="sm"
              disabled={isRevokingAll}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isRevokingAll ? 'Revoking...' : 'Logout Other Devices'}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {sessions.map((session) => (
          <Card key={session.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800">
                  {getDeviceIcon(session)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">
                      {session.browser || 'Unknown Browser'} on {session.os || 'Unknown OS'}
                    </CardTitle>
                    {session.isCurrent && (
                      <Badge variant="default" className="flex items-center gap-1 text-xs">
                        <Check className="h-3 w-3" />
                        This device
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    <span className="flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {session.ipAddress || 'Unknown IP'}
                    </span>
                    {session.location && (
                      <span>{session.location}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-neutral-500 dark:text-neutral-500">
                    <span>Last active: {formatTimeAgo(session.lastUsedAt)}</span>
                    <span>Signed in: {formatDate(session.createdAt)}</span>
                  </div>
                </div>
              </div>

              {!session.isCurrent && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevokeSession(session.id)}
                  disabled={isRevoking}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {sessions.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <Shield className="h-12 w-12 mx-auto text-neutral-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Active Sessions</h3>
            <p className="text-neutral-600 dark:text-neutral-400">
              You don&apos;t have any active sessions at the moment.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
