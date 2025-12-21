import React from 'react';
import { Suspense } from 'react';
import InsightsDashboard from '@/components/analytics/InsightsDashboard';
import ProtectedProjectRoute from '@/components/ProtectedProjectRoute';
import Spinner from '@/components/Spinner';
import { serverFetch } from '@/lib/server-fetcher';
import type {
    VelocityData,
    BurndownData,
    EpicProgressData,
    IssueBreakdownData
} from '@/hooks/useReports';
import type { CycleTimeData, SprintRiskData } from '@/hooks/useAnalytics';
import type { Sprint } from '@/hooks/useSprints';

export const metadata = {
    title: 'Project Insights | Zenith',
    description: 'Real-time project analytics and sprint health reports.',
};

async function InsightsData({ projectId }: { projectId: string }) {
    // 1. Parallel Fetch of independent data
    const [
        velocityData,
        epicProgressData,
        issueBreakdownData,
        activeSprintList,
        cycleTimeData
    ] = await Promise.all([
        serverFetch<VelocityData[]>(`/projects/${projectId}/reports/velocity`).catch(() => []),
        serverFetch<EpicProgressData[]>(`/projects/${projectId}/reports/epic-progress`).catch(() => []),
        serverFetch<IssueBreakdownData>(`/projects/${projectId}/reports/issue-breakdown`).catch(() => ({
            typeBreakdown: {}, priorityBreakdown: {}, statusBreakdown: {}, assigneeBreakdown: {}, totalIssues: 0
        })),
        serverFetch<Sprint[]>(`/projects/${projectId}/sprints?active=true`).catch(() => []),
        serverFetch<CycleTimeData>(`/projects/${projectId}/analytics/cycle-time?days=30`).catch(() => null),
    ]);

    const activeSprint = activeSprintList?.[0] || null;

    // 2. Fetch dependent data (Burndown & Risk need Active Sprint ID)
    let burndownData: BurndownData[] = [];
    let riskData: SprintRiskData | null = null;

    if (activeSprint) {
        const [burndownRes, riskRes] = await Promise.all([
            serverFetch<BurndownData[]>(`/projects/${projectId}/reports/burndown?sprintId=${activeSprint.id}`).catch(() => []),
            serverFetch<SprintRiskData>(`/projects/${projectId}/analytics/sprints/${activeSprint.id}/risk`).catch(() => null),
        ]);
        burndownData = burndownRes;
        riskData = riskRes;
    }

    return (
        <InsightsDashboard
            velocityData={velocityData}
            burndownData={burndownData}
            epicProgressData={epicProgressData}
            issueBreakdownData={issueBreakdownData}
            activeSprint={activeSprint}
            cycleTimeData={cycleTimeData}
            riskData={riskData}
        />
    );
}

export default async function InsightsPage({ params }: { params: Promise<{ id: string }> }) {
    // Await params as per Next.js 15
    const { id: projectId } = await params;

    return (
        <ProtectedProjectRoute allowedRoles={["Super-Admin", "ProjectLead", "Developer"]}>
            <div className="p-4 lg:p-6 max-w-[1600px] mx-auto min-h-screen bg-neutral-50/50 dark:bg-[#0a0a0a]">
                <Suspense fallback={
                    <div className="flex justify-center items-center h-[60vh]">
                        <div className="relative">
                            <div className="absolute inset-0 rounded-full blur-xl bg-primary-500/30 animate-pulse" />
                            <Spinner className="h-16 w-16 text-primary-600 relative z-10" />
                        </div>
                    </div>
                }>
                    <InsightsData projectId={projectId} />
                </Suspense>
            </div>
        </ProtectedProjectRoute>
    );
}
