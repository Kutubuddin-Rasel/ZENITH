"use client";
import React, { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client'; // Added
// import { useAuth } from '../context/AuthContext'; // Removed
import Button from './Button';
import Typography from './Typography';
import Card from './Card';
import Input from './Input';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  UserIcon,
  GlobeAltIcon,
  ChartBarIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';

interface AuditLog {
  id: string;
  eventType: string;
  severity: string;
  status: string;
  description: string;
  details: string;
  userId: string;
  userEmail: string;
  userName: string;
  resourceType: string;
  resourceId: string;
  projectId: string;
  ipAddress: string;
  userAgent: string;
  sessionId: string;
  requestId: string;
  country: string;
  city: string;
  region: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

interface AuditStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  eventsByStatus: Record<string, number>;
  eventsByUser: Record<string, number>;
  eventsByProject: Record<string, number>;
  eventsByDay: Record<string, number>;
  topUsers: Array<{ userId: string; userName: string; count: number }>;
  topProjects: Array<{ projectId: string; count: number }>;
  securityEvents: number;
  failedLogins: number;
  suspiciousActivity: number;
}

interface AuditDashboardProps {
  projectId?: string;
}

export default function AuditDashboard({ projectId }: AuditDashboardProps) {
  // const { token } = useAuth(); // Removed
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    eventTypes: '',
    severities: '',
    statuses: '',
    search: '',
    startDate: '',
    endDate: '',
    limit: '50',
  });
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const fetchAuditLogs = React.useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      if (projectId) params.append('projectIds', projectId);

      const data = await apiClient.get<{ logs: AuditLog[] }>(`/audit/logs?${params}`);
      setLogs(data.logs || []);
    } catch {
      setError('Failed to fetch audit logs');
    } finally {
      setIsLoading(false);
    }
  }, [filters, projectId]);

  const fetchAuditStats = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (projectId) params.append('projectId', projectId);

      const data = await apiClient.get<AuditStats>(`/audit/stats?${params}`);
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch audit stats:', err);
    }
  }, [filters, projectId]);

  useEffect(() => {
    fetchAuditLogs();
    fetchAuditStats();
  }, [filters, projectId, fetchAuditLogs, fetchAuditStats]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      eventTypes: '',
      severities: '',
      statuses: '',
      search: '',
      startDate: '',
      endDate: '',
      limit: '50',
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100 dark:bg-red-900 dark:text-red-200';
      case 'high': return 'text-orange-600 bg-orange-100 dark:bg-orange-900 dark:text-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-200';
      case 'low': return 'text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-200';
      default: return 'text-neutral-600 bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircleIcon className="h-4 w-4 text-green-600" />;
      case 'failure': return <XCircleIcon className="h-4 w-4 text-red-600" />;
      case 'warning': return <ExclamationTriangleIcon className="h-4 w-4 text-yellow-600" />;
      default: return <ClockIcon className="h-4 w-4 text-neutral-600" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const exportLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (projectId) params.append('projectId', projectId);
      params.append('format', 'csv');

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/audit/export?${params}`, {
        headers: {
          // 'Authorization': `Bearer ${token}`, // Removed
        },
        credentials: 'include', // Added for HttpOnly cookie
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch {
      setError('Failed to export audit logs');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <Typography variant="h1" className="mb-2">
            Audit Dashboard
          </Typography>
          <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
            Monitor system activity and security events
          </Typography>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="secondary"
            onClick={() => setShowFilters(!showFilters)}
          >
            <FunnelIcon className="h-5 w-5 mr-2" />
            Filters
          </Button>
          <Button
            variant="secondary"
            onClick={exportLogs}
          >
            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export
          </Button>
          <Button
            variant="secondary"
            onClick={fetchAuditLogs}
            loading={isLoading}
          >
            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card className="p-6">
          <Typography variant="h3" className="mb-4">Filters</Typography>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Search
              </label>
              <Input
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                placeholder="Search logs..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Start Date
              </label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                End Date
              </label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Severity
              </label>
              <select
                value={filters.severities}
                onChange={(e) => handleFilterChange('severities', e.target.value)}
                className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm dark:text-white border-neutral-200 dark:border-neutral-700 transition-all duration-300 hover:border-neutral-300 dark:hover:border-neutral-600 focus:border-blue-500 dark:focus:border-blue-400 shadow-sm hover:shadow-md focus:shadow-lg"
              >
                <option value="">All Severities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Status
              </label>
              <select
                value={filters.statuses}
                onChange={(e) => handleFilterChange('statuses', e.target.value)}
                className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm dark:text-white border-neutral-200 dark:border-neutral-700 transition-all duration-300 hover:border-neutral-300 dark:hover:border-neutral-600 focus:border-blue-500 dark:focus:border-blue-400 shadow-sm hover:shadow-md focus:shadow-lg"
              >
                <option value="">All Statuses</option>
                <option value="success">Success</option>
                <option value="failure">Failure</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Limit
              </label>
              <Input
                type="number"
                value={filters.limit}
                onChange={(e) => handleFilterChange('limit', e.target.value)}
                placeholder="50"
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="secondary" onClick={clearFilters}>
              Clear Filters
            </Button>
          </div>
        </Card>
      )}

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center">
              <ChartBarIcon className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <Typography variant="h3" className="font-bold">{stats.totalEvents}</Typography>
                <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">Total Events</Typography>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center">
              <ShieldCheckIcon className="h-8 w-8 text-green-600 mr-3" />
              <div>
                <Typography variant="h3" className="font-bold">{stats.securityEvents}</Typography>
                <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">Security Events</Typography>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center">
              <XCircleIcon className="h-8 w-8 text-red-600 mr-3" />
              <div>
                <Typography variant="h3" className="font-bold">{stats.failedLogins}</Typography>
                <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">Failed Logins</Typography>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center">
              <ExclamationTriangleIcon className="h-8 w-8 text-yellow-600 mr-3" />
              <div>
                <Typography variant="h3" className="font-bold">{stats.suspiciousActivity}</Typography>
                <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">Suspicious Activity</Typography>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Audit Logs */}
      <Card className="p-6">
        <Typography variant="h3" className="mb-4">Audit Logs</Typography>

        {error && (
          <div className="flex items-center space-x-2 text-red-600 dark:text-red-400 mb-4">
            <ExclamationTriangleIcon className="h-5 w-5" />
            <Typography variant="body" className="text-sm">{error}</Typography>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
            <Typography variant="body" className="mt-2">Loading audit logs...</Typography>
          </div>
        ) : (
          <div className="space-y-4">
            {logs.length === 0 ? (
              <div className="text-center py-8">
                <ClockIcon className="h-16 w-16 text-neutral-400 mx-auto mb-4" />
                <Typography variant="h4" className="mb-2">No Audit Logs</Typography>
                <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
                  No audit logs found matching your criteria.
                </Typography>
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
                  onClick={() => setSelectedLog(log)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        {getStatusIcon(log.status)}
                        <Typography variant="h4" className="font-medium">
                          {log.description}
                        </Typography>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(log.severity)}`}>
                          {log.severity.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-neutral-600 dark:text-neutral-400">
                        <div className="flex items-center space-x-1">
                          <UserIcon className="h-4 w-4" />
                          <span>{log.userName || log.userEmail || 'System'}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <ClockIcon className="h-4 w-4" />
                          <span>{formatTimestamp(log.timestamp)}</span>
                        </div>
                        {log.ipAddress && (
                          <div className="flex items-center space-x-1">
                            <GlobeAltIcon className="h-4 w-4" />
                            <span>{log.ipAddress}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <Typography variant="body" className="text-sm font-mono text-neutral-500">
                        {log.eventType.replace(/_/g, ' ').toUpperCase()}
                      </Typography>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Card>

      {/* Log Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <Typography variant="h3">Audit Log Details</Typography>
                <Button variant="ghost" onClick={() => setSelectedLog(null)}>
                  <XCircleIcon className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Typography variant="h4" className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                      Event Type
                    </Typography>
                    <Typography variant="body" className="font-mono">
                      {selectedLog.eventType}
                    </Typography>
                  </div>
                  <div>
                    <Typography variant="h4" className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                      Severity
                    </Typography>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(selectedLog.severity)}`}>
                      {selectedLog.severity.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <Typography variant="h4" className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                      Status
                    </Typography>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(selectedLog.status)}
                      <span className="capitalize">{selectedLog.status}</span>
                    </div>
                  </div>
                  <div>
                    <Typography variant="h4" className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                      Timestamp
                    </Typography>
                    <Typography variant="body">
                      {formatTimestamp(selectedLog.timestamp)}
                    </Typography>
                  </div>
                </div>

                <div>
                  <Typography variant="h4" className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                    Description
                  </Typography>
                  <Typography variant="body">{selectedLog.description}</Typography>
                </div>

                {selectedLog.details && (
                  <div>
                    <Typography variant="h4" className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                      Details
                    </Typography>
                    <pre className="bg-neutral-100 dark:bg-neutral-800 p-3 rounded text-sm overflow-x-auto">
                      {JSON.stringify(JSON.parse(selectedLog.details), null, 2)}
                    </pre>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Typography variant="h4" className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                      User
                    </Typography>
                    <Typography variant="body">
                      {selectedLog.userName || selectedLog.userEmail || 'System'}
                    </Typography>
                  </div>
                  <div>
                    <Typography variant="h4" className="text-sm font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                      IP Address
                    </Typography>
                    <Typography variant="body">{selectedLog.ipAddress || 'N/A'}</Typography>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
