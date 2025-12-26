"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../hooks/useProject";
import { useProjectSummary } from '@/hooks/useProject';
import Spinner from "../../../components/Spinner";
import { getSocket } from '@/lib/socket';
import Link from 'next/link';
import Button from "@/components/Button";
import Typography from "@/components/Typography";
import Card from "@/components/Card";
import {
  useProjectMembers,
} from '@/hooks/useProject';
import {
  UserIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  RocketLaunchIcon,
  UsersIcon,
  ArrowTrendingUpIcon,
} from "@heroicons/react/24/outline";
import {
  BriefcaseIcon as BriefcaseSolid,
  UsersIcon as UsersSolid,
  TrophyIcon
} from "@heroicons/react/24/solid";
import { useActiveSprint } from '@/hooks/useSprints';
import { useSprintIssues } from '@/hooks/useSprintIssues';
import { XCircleIcon, Cog6ToothIcon } from '@heroicons/react/24/solid';
import { PlusIcon } from '@heroicons/react/24/outline';
import { getProjectHealth, getHealthBadgeClasses } from '@/lib/project-health';
import CreateIssueModal from '@/components/CreateIssueModal';
import EmptyProjectHero from '@/components/EmptyProjectHero';

interface ProjectActivity {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  user: { name: string; email: string };
  [key: string]: unknown;
}

import { apiClient } from '@/lib/api-client';

function useProjectActivity(projectId: string) {
  const [activity, setActivity] = useState<ProjectActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setError(null);

    apiClient.get<ProjectActivity[]>(`/projects/${projectId}/activity`)
      .then((data) => setActivity(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to fetch activity'))
      .finally(() => setLoading(false));
  }, [projectId]);

  return { activity, loading, error };
}

export default function ProjectDashboard() {
  const params = useParams();
  const id = params.id as string;
  const { project, isLoading: loadingProject, isError: errorProject, currentUserRole } = useProject(id);
  const { data: summary, isLoading: loadingSummary, refetch: refetchSummary } = useProjectSummary(id);
  const { data: members } = useProjectMembers(id);
  const { activity, loading: loadingActivity, error: errorActivity } = useProjectActivity(id);
  const router = useRouter();
  const { activeSprint, isLoading: loadingActiveSprint, isError: errorActiveSprint } = useActiveSprint(id);
  const { issues: sprintIssues, isLoading: loadingSprintIssues } = useSprintIssues(id, activeSprint?.id || '');
  const [isCreateIssueOpen, setIsCreateIssueOpen] = React.useState(false);


  // Real-time updates for summary/activity
  React.useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (notification: { message: string; context?: { projectId?: string } }) => {
      if (notification?.context?.projectId === id) {
        refetchSummary();
      }
    };
    socket.on('notification', handler);
    return () => { socket.off('notification', handler); };
  }, [id, refetchSummary]);

  // Status breakdown with consistent colors
  const statusColors: Record<string, string> = {
    Done: '#10b981', // emerald-500
    InProgress: '#f59e0b', // amber-500
    Todo: '#6b7280', // neutral-500
    Backlog: '#3b82f6', // blue-500
    Blocked: '#ef4444', // red-500
    Review: '#8b5cf6', // violet-500
  };


  // Check if user can manage project
  const canManageProject = currentUserRole === 'Super-Admin' || currentUserRole === 'ProjectLead';

  if (loadingProject || loadingSummary) {
    return (
      <div className="flex justify-center items-center h-96">
        <Spinner className="h-12 w-12" />
      </div>
    );
  }

  if (errorProject || !project) {
    return (
      <div className="flex justify-center items-center h-96">
        <Card className="text-center p-8 max-w-md">
          <ExclamationTriangleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <Typography variant="h3" className="text-red-700 dark:text-red-300 mb-2">
            Failed to load project
          </Typography>
          <Typography variant="body" className="text-red-600 dark:text-red-400">
            Please try refreshing the page.
          </Typography>
        </Card>
      </div>
    );
  }

  const totalMembers = members?.length || 0;
  const percentDone = summary?.percentDone || 0;
  const totalIssues = summary?.totalIssues || 0;
  const doneIssues = summary?.doneIssues || 0;

  // Calculate project health (must be after percentDone is defined)
  const health = getProjectHealth(summary?.statusCounts, percentDone);

  return (
    <div className="space-y-8">
      {/* Project Header */}
      <Card className="p-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-primary-600 rounded-xl flex items-center justify-center shadow-sm">
              <Typography variant="h2" className="text-white font-bold">
                {project.name?.charAt(0).toUpperCase() || '?'}
              </Typography>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-4 flex-wrap">
                <Typography variant="h1" className="text-neutral-900 dark:text-white">
                  {project.name}
                </Typography>
                <span className="px-3 py-1 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 text-sm font-semibold rounded-full">
                  {project.key}
                </span>
                {/* Health Badge */}
                <span className={getHealthBadgeClasses(health.color)} title={health.reason}>
                  {health.color === 'success' && <CheckCircleIcon className="h-4 w-4" />}
                  {health.color === 'warning' && <ExclamationTriangleIcon className="h-4 w-4" />}
                  {health.color === 'error' && <XCircleIcon className="h-4 w-4" />}
                  {health.label}
                </span>
              </div>
              <Typography variant="body" className="text-neutral-600 dark:text-neutral-400 max-w-2xl">
                {project.description || "No description provided"}
              </Typography>
              <div className="flex items-center gap-6 text-sm text-neutral-500 dark:text-neutral-400">
                <span className="flex items-center gap-2">
                  <UsersIcon className="h-4 w-4" />
                  {totalMembers} Team {totalMembers === 1 ? 'Member' : 'Members'}
                </span>
                <span className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  Started {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Header Actions - Inline with header */}
          {canManageProject && (
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                onClick={() => setIsCreateIssueOpen(true)}
                className="flex items-center gap-2"
              >
                Create Issue
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push(`/projects/${id}/settings`)}
                className="flex items-center gap-2"
              >
                <Cog6ToothIcon className="h-4 w-4" />
                Settings
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Conditional Content: Empty State OR Full Dashboard */}
      {totalIssues === 0 ? (
        <EmptyProjectHero
          projectId={id}
          onCreateIssue={() => setIsCreateIssueOpen(true)}
          canManageProject={canManageProject}
        />
      ) : (
        <>
          {/* Stats Cards - Clickable */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                label: 'Total Issues',
                value: totalIssues,
                icon: <BriefcaseSolid className="h-6 w-6" />,
                color: 'text-blue-600 dark:text-blue-400',
                bgColor: 'bg-blue-100 dark:bg-blue-900',
                href: `/projects/${id}/issues`
              },
              {
                label: 'Completion Rate',
                value: `${percentDone}%`,
                icon: <TrophyIcon className="h-6 w-6" />,
                color: 'text-emerald-600 dark:text-emerald-400',
                bgColor: 'bg-emerald-100 dark:bg-emerald-900',
                href: `/projects/${id}/insights`
              },
              {
                label: 'Team Members',
                value: totalMembers,
                icon: <UsersSolid className="h-6 w-6" />,
                color: 'text-purple-600 dark:text-purple-400',
                bgColor: 'bg-purple-100 dark:bg-purple-900',
                href: `/projects/${id}/team`
              },
            ].map((stat) => (
              <Card
                key={stat.label}
                className="p-6 cursor-pointer hover:shadow-lg hover:border-primary-300 dark:hover:border-primary-700 transition-all duration-200"
                onClick={() => router.push(stat.href)}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                    <div className={stat.color}>
                      {stat.icon}
                    </div>
                  </div>
                  <div>
                    <Typography variant="h2" className={stat.color}>
                      {stat.value}
                    </Typography>
                    <Typography variant="body-sm" className="text-neutral-500 dark:text-neutral-400 font-medium">
                      {stat.label}
                    </Typography>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Progress Overview */}
          <Card className="p-8">
            <div className="flex items-center justify-between mb-6">
              <Typography variant="h3" className="text-neutral-900 dark:text-white">
                Progress Overview
              </Typography>
              <ArrowTrendingUpIcon className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Typography variant="body" className="font-semibold text-neutral-700 dark:text-neutral-300">
                    Overall Progress
                  </Typography>
                  <Typography variant="h3" className="text-emerald-600 dark:text-emerald-400">
                    {percentDone}%
                  </Typography>
                </div>
                <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-4 bg-emerald-500 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${percentDone}%` }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Typography variant="body" className="font-semibold text-neutral-700 dark:text-neutral-300">
                  Status Breakdown
                </Typography>
                <div className="space-y-2">
                  {Object.entries(summary?.statusCounts || {}).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: statusColors[status] || '#6b7280' }}
                        />
                        <Typography variant="body" className="font-medium text-neutral-700 dark:text-neutral-300">
                          {status}
                        </Typography>
                      </div>
                      <Typography variant="body" className="font-bold text-neutral-900 dark:text-white">
                        {count}
                      </Typography>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Active Sprint Card */}
          <Card className="p-8">
            {loadingActiveSprint ? (
              <div className="flex items-center justify-center py-12">
                <Spinner className="h-8 w-8" />
              </div>
            ) : errorActiveSprint ? (
              <div className="text-center py-12">
                <ExclamationTriangleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
                <Typography variant="h3" className="text-red-700 dark:text-red-300 mb-2">
                  Failed to load active sprint
                </Typography>
                <Typography variant="body" className="text-red-600 dark:text-red-400">
                  Please try refreshing the page.
                </Typography>
              </div>
            ) : activeSprint ? (
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center">
                      <RocketLaunchIcon className="h-8 w-8 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div>
                      <Typography variant="h3" className="text-neutral-900 dark:text-white">
                        Active Sprint
                      </Typography>
                      <span className="inline-block mt-1 px-3 py-1 text-xs font-bold rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                        ACTIVE
                      </span>
                    </div>
                  </div>
                  <Typography variant="h2" className="text-neutral-900 dark:text-white">
                    {activeSprint.name}
                  </Typography>
                  {activeSprint.goal && (
                    <Typography variant="body" className="text-neutral-600 dark:text-neutral-400 italic">
                      🎯 {activeSprint.goal}
                    </Typography>
                  )}
                  <div className="flex items-center gap-6 text-sm text-neutral-500 dark:text-neutral-400">
                    {activeSprint.startDate && activeSprint.endDate ? (
                      <span className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {new Date(activeSprint.startDate).toLocaleDateString()} - {new Date(activeSprint.endDate).toLocaleDateString()}
                      </span>
                    ) : (
                      <span>No dates set</span>
                    )}
                  </div>
                  {/* Sprint Stats */}
                  <div className="flex gap-6 mt-4">
                    <div className="flex flex-col items-center">
                      <Typography variant="h4" className="text-neutral-900 dark:text-white">
                        {sprintIssues?.length || 0}
                      </Typography>
                      <Typography variant="body-sm" className="text-neutral-500 dark:text-neutral-400">
                        Total Issues
                      </Typography>
                    </div>
                    <div className="flex flex-col items-center">
                      <Typography variant="h4" className="text-green-600 dark:text-green-400">
                        {sprintIssues?.filter(i => i.status === 'Done').length || 0}
                      </Typography>
                      <Typography variant="body-sm" className="text-neutral-500 dark:text-neutral-400">
                        Done
                      </Typography>
                    </div>
                    <div className="flex flex-col items-center">
                      <Typography variant="h4" className="text-orange-600 dark:text-orange-400">
                        {sprintIssues?.filter(i => i.status !== 'Done').length || 0}
                      </Typography>
                      <Typography variant="body-sm" className="text-neutral-500 dark:text-neutral-400">
                        Remaining
                      </Typography>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-center items-center gap-8">
                  {loadingSprintIssues ? (
                    <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-6 animate-pulse" />
                  ) : (
                    (() => {
                      const total = sprintIssues?.length || 0;
                      const done = sprintIssues?.filter(i => i.status === 'Done').length || 0;
                      const percent = total ? Math.round((done / total) * 100) : 0;
                      return (
                        <div className="w-full max-w-xl">
                          <div className="flex justify-between items-center mb-2">
                            <Typography variant="body" className="font-semibold text-neutral-700 dark:text-neutral-300">
                              Sprint Progress
                            </Typography>
                            <Typography variant="h4" className="text-neutral-900 dark:text-white">
                              {percent}%
                            </Typography>
                          </div>
                          <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-6 overflow-hidden">
                            <div
                              className="bg-green-500 h-6 rounded-full transition-all duration-1000 ease-out"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <Typography variant="body" className="text-neutral-600 dark:text-neutral-400 mt-2 text-center">
                            {done} of {total} issues completed
                          </Typography>
                        </div>
                      );
                    })()
                  )}
                  <Link href={`/projects/${id}/sprints/${activeSprint.id}`}>
                    <Button>
                      <RocketLaunchIcon className="h-5 w-5 mr-2" />
                      Go to Sprint
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <ClockIcon className="h-8 w-8 text-neutral-400" />
                    <Typography variant="h3" className="text-neutral-900 dark:text-white">
                      No Active Sprint
                    </Typography>
                  </div>
                  <Typography variant="body" className="text-neutral-600 dark:text-neutral-400 max-w-2xl">
                    Start a sprint to begin tracking progress and organizing your work!
                  </Typography>
                </div>

                {['Super-Admin', 'ProjectLead'].includes(currentUserRole ?? '') && (
                  <Link href={`./sprints`}>
                    <Button>
                      <RocketLaunchIcon className="h-5 w-5 mr-2" />
                      Start Sprint
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </Card>

          {/* Recent Activity */}
          <Card className="p-8">
            <div className="flex items-center justify-between mb-6">
              <Typography variant="h3" className="text-neutral-900 dark:text-white">
                Recent Activity
              </Typography>
            </div>

            {loadingActivity ? (
              <div className="flex items-center justify-center py-12">
                <Spinner className="h-8 w-8" />
              </div>
            ) : errorActivity ? (
              <div className="text-center py-12">
                <ExclamationTriangleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
                <Typography variant="body" className="text-red-600 dark:text-red-400">
                  {errorActivity}
                </Typography>
              </div>
            ) : (Array.isArray(activity) ? activity : []).length === 0 ? (
              <div className="text-center py-12">
                <ClockIcon className="h-16 w-16 text-neutral-400 mx-auto mb-4" />
                <Typography variant="body" className="text-neutral-500 dark:text-neutral-400">
                  No recent activity
                </Typography>
              </div>
            ) : (
              <div className="space-y-4">
                {(Array.isArray(activity) ? activity : []).slice(0, 5).map((rev) => {
                  let href = null;
                  if (rev.entityType === 'Issue') {
                    href = `./issues/${rev.entityId}`;
                  } else if (rev.entityType === 'Sprint') {
                    href = `./sprints`;
                  } else if (rev.entityType === 'Release') {
                    href = `./releases`;
                  }
                  return (
                    <div
                      key={rev.id}
                      className="flex items-center gap-4 p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors duration-200 cursor-pointer"
                      onClick={() => href && router.push(href)}
                    >
                      <div className="flex-shrink-0 w-10 h-10 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center">
                        <ArrowTrendingUpIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-3">
                          <Typography variant="body-sm" className="font-semibold text-primary-600 dark:text-primary-400">
                            {String(rev.action)}
                          </Typography>
                          <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 text-xs font-semibold rounded-full">
                            {String(rev.entityType)}
                          </span>
                        </div>
                        <Typography variant="body" className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                          {String(
                            typeof rev.snapshot === 'object' && rev.snapshot !== null && 'title' in rev.snapshot ? rev.snapshot.title :
                              typeof rev.snapshot === 'object' && rev.snapshot !== null && 'name' in rev.snapshot ? rev.snapshot.name :
                                rev.entityId || ''
                          )}
                        </Typography>
                        <div className="flex items-center gap-4 text-sm text-neutral-500 dark:text-neutral-400">
                          <span className="flex items-center gap-1">
                            <UserIcon className="h-4 w-4" />
                            {String(rev.changedBy || '')}
                          </span>
                          <span className="flex items-center gap-1">
                            <ClockIcon className="h-4 w-4" />
                            {typeof rev.createdAt === 'string' ? new Date(rev.createdAt).toLocaleString() : 'Unknown date'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Create Issue Modal - Always rendered */}
      <CreateIssueModal
        isOpen={isCreateIssueOpen}
        onClose={() => setIsCreateIssueOpen(false)}
        projectId={id}
      />
    </div>
  );
}