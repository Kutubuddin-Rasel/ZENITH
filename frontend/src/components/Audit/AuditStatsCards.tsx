import React from 'react';
import Typography from '../Typography';
import Card from '../Card';
import {
    ShieldCheckIcon,
    ExclamationTriangleIcon,
    XCircleIcon,
    ChartBarIcon,
} from '@heroicons/react/24/outline';

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

interface AuditStatsCardsProps {
    stats: AuditStats;
}

/**
 * Audit Stats Cards Component
 * 
 * Displays summary statistics for audit logs in a grid of cards.
 * Shows total events, security events, failed logins, and suspicious activity.
 * 
 * Extracted from AuditDashboard for better maintainability.
 */
export function AuditStatsCards({ stats }: AuditStatsCardsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4">
                <div className="flex items-center">
                    <ChartBarIcon className="h-8 w-8 text-blue-600 mr-3" />
                    <div>
                        <Typography variant="h3" className="font-bold">{stats.totalEvents}</Typography>
                        <Typography variant="body" className="text-gray-600 dark:text-gray-400">Total Events</Typography>
                    </div>
                </div>
            </Card>
            <Card className="p-4">
                <div className="flex items-center">
                    <ShieldCheckIcon className="h-8 w-8 text-green-600 mr-3" />
                    <div>
                        <Typography variant="h3" className="font-bold">{stats.securityEvents}</Typography>
                        <Typography variant="body" className="text-gray-600 dark:text-gray-400">Security Events</Typography>
                    </div>
                </div>
            </Card>
            <Card className="p-4">
                <div className="flex items-center">
                    <XCircleIcon className="h-8 w-8 text-red-600 mr-3" />
                    <div>
                        <Typography variant="h3" className="font-bold">{stats.failedLogins}</Typography>
                        <Typography variant="body" className="text-gray-600 dark:text-gray-400">Failed Logins</Typography>
                    </div>
                </div>
            </Card>
            <Card className="p-4">
                <div className="flex items-center">
                    <ExclamationTriangleIcon className="h-8 w-8 text-yellow-600 mr-3" />
                    <div>
                        <Typography variant="h3" className="font-bold">{stats.suspiciousActivity}</Typography>
                        <Typography variant="body" className="text-gray-600 dark:text-gray-400">Suspicious Activity</Typography>
                    </div>
                </div>
            </Card>
        </div>
    );
}

export default AuditStatsCards;
