"use client";
import React, { useState, useEffect } from 'react';
import Card from './Card';
import { CardHeader, CardContent, CardTitle } from './CardComponents';
import Button from './Button';
import Badge from './Badge';
import Alert, { AlertDescription } from './Alert';
import { 
  Shield, 
  Monitor, 
  Smartphone, 
  Tablet, 
  Globe, 
  Clock, 
  AlertTriangle,
  Lock,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';

interface SessionInfo {
  sessionId: string;
  userId: string;
  status: string;
  type: string;
  lastActivity: string;
  expiresAt: string;
  userAgent?: string;
  ipAddress?: string;
  country?: string;
  city?: string;
  region?: string;
  deviceInfo?: {
    deviceName?: string;
    osName?: string;
    osVersion?: string;
    browserName?: string;
    browserVersion?: string;
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
  };
  isConcurrent: boolean;
  concurrentCount: number;
  requestCount: number;
  isSecure: boolean;
  isRememberMe: boolean;
  isTwoFactorVerified: boolean;
  isSuspicious: boolean;
  isLocked: boolean;
  createdAt: string;
}

interface SessionManagementProps {
  onSessionTerminated?: () => void;
}

export default function SessionManagement({ onSessionTerminated }: SessionManagementProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/sessions/my-sessions', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch sessions');
      }

      const data = await response.json();
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const terminateSession = async (sessionId: string, reason?: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        throw new Error('Failed to terminate session');
      }

      setSessions(sessions.filter(s => s.sessionId !== sessionId));
      onSessionTerminated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to terminate session');
    }
  };

  const terminateAllSessions = async (exceptCurrent: boolean = true) => {
    try {
      const response = await fetch('/api/sessions/my-sessions/all', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          reason: 'User requested termination',
          exceptCurrent 
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to terminate sessions');
      }

      await response.json();
      setSessions(sessions.filter(s => s.isConcurrent));
      onSessionTerminated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to terminate sessions');
    }
  };

  const refreshSession = async () => {
    try {
      const response = await fetch('/api/sessions/refresh', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to refresh session');
      }

      await fetchSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh session');
    }
  };

  const getDeviceIcon = (session: SessionInfo) => {
    if (session.deviceInfo?.isMobile) return <Smartphone className="h-4 w-4" />;
    if (session.deviceInfo?.isTablet) return <Tablet className="h-4 w-4" />;
    if (session.deviceInfo?.isDesktop) return <Monitor className="h-4 w-4" />;
    return <Globe className="h-4 w-4" />;
  };

  const getStatusBadge = (session: SessionInfo) => {
    if (session.isLocked) {
      return <Badge variant="destructive" className="flex items-center gap-1"><Lock className="h-3 w-3" />Locked</Badge>;
    }
    if (session.isSuspicious) {
      return <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Suspicious</Badge>;
    }
    if (session.isConcurrent) {
      return <Badge variant="secondary" className="flex items-center gap-1"><Globe className="h-3 w-3" />Concurrent</Badge>;
    }
    return <Badge variant="default" className="flex items-center gap-1"><Shield className="h-3 w-3" />Active</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatDuration = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h ago`;
    if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m ago`;
    return `${diffMins}m ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading sessions...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Active Sessions</h2>
        <div className="flex gap-2">
          <Button onClick={refreshSession} variant="secondary" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            onClick={() => terminateAllSessions(true)} 
            variant="danger" 
            size="sm"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Terminate Others
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4">
        {sessions.map((session) => (
          <Card key={session.sessionId} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getDeviceIcon(session)}
                  <div>
                    <CardTitle className="text-lg">
                      {session.deviceInfo?.deviceName || 'Unknown Device'}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {session.deviceInfo?.osName} {session.deviceInfo?.osVersion} • 
                      {session.deviceInfo?.browserName} {session.deviceInfo?.browserVersion}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(session)}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDetails(prev => ({
                      ...prev,
                      [session.sessionId]: !prev[session.sessionId]
                    }))}
                  >
                    {showDetails[session.sessionId] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">Last Activity</p>
                  <p>{formatDuration(session.lastActivity)}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Location</p>
                  <p>{session.city && session.country ? `${session.city}, ${session.country}` : 'Unknown'}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">IP Address</p>
                  <p className="font-mono text-xs">{session.ipAddress || 'Unknown'}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Requests</p>
                  <p>{session.requestCount.toLocaleString()}</p>
                </div>
              </div>

              {showDetails[session.sessionId] && (
                <div className="mt-4 pt-4 border-t space-y-2">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-medium text-muted-foreground">Session ID</p>
                      <p className="font-mono text-xs break-all">{session.sessionId}</p>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground">Created</p>
                      <p>{formatDate(session.createdAt)}</p>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground">Expires</p>
                      <p>{formatDate(session.expiresAt)}</p>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground">Type</p>
                      <p className="capitalize">{session.type}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      <span>2FA: {session.isTwoFactorVerified ? 'Verified' : 'Not Verified'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      <span>Secure: {session.isSecure ? 'Yes' : 'No'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>Remember: {session.isRememberMe ? 'Yes' : 'No'}</span>
                    </div>
                  </div>

                  {session.isSuspicious && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        This session has been flagged for suspicious activity.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => terminateSession(session.sessionId, 'User requested termination')}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Terminate
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {sessions.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Active Sessions</h3>
            <p className="text-muted-foreground">
              You don&apos;t have any active sessions at the moment.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
