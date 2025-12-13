"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../hooks/useProject";
import { useProjectSummary } from '@/hooks/useProject';
import Spinner from "../../../components/Spinner";
import { getSocket } from '@/lib/socket';
import Link from 'next/link';
import Button from "@/components/Button";
import {
  useProjectMembers,
} from '@/hooks/useProject';
import {
  BriefcaseIcon,
  UserIcon,
  ArrowRightOnRectangleIcon,
  UserPlusIcon,
  DocumentPlusIcon,
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  RocketLaunchIcon,
  FireIcon,
  UsersIcon,
  ArrowTrendingUpIcon,
  EyeIcon,
  PlusIcon,
  SparklesIcon
} from "@heroicons/react/24/outline";
import {
  BriefcaseIcon as BriefcaseSolid,
  RocketLaunchIcon as RocketLaunchSolid,
  UsersIcon as UsersSolid,
  TrophyIcon
} from "@heroicons/react/24/solid";
import { useActiveSprint } from '@/hooks/useSprints';
import { useSprintIssues } from '@/hooks/useSprintIssues';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import SpeedDialFAB, { SpeedDialAction } from '@/components/SpeedDialFAB';
import { PencilIcon } from '@heroicons/react/24/solid';

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
  const [selectedStatus, setSelectedStatus] = React.useState<string | null>(null);


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

  // Status breakdown with enhanced colors
  const statusColors: Record<string, string> = {
    Done: '#10b981', // emerald-500
    InProgress: '#f59e0b', // amber-500
    Todo: '#6b7280', // gray-500
    Backlog: '#3b82f6', // blue-500
    Blocked: '#ef4444', // red-500
    Review: '#8b5cf6', // violet-500
  };

  // Progress bar segments
  const statusCounts = summary?.statusCounts || {};

  const donutData = Object.entries(statusCounts).map(([status, count]) => ({ name: status, value: count }));


  const actions: SpeedDialAction[] = [
    {
      icon: <PencilIcon className="h-6 w-6" />,
      label: 'Edit Project',
      onClick: () => console.log('Edit project clicked'),
    },
    {
      icon: <DocumentPlusIcon className="h-6 w-6" />,
      label: 'Create Issue',
      onClick: () => alert('Create Issue clicked'), // Placeholder
    },
    {
      icon: <UserPlusIcon className="h-6 w-6" />,
      label: 'Invite Member',
      onClick: () => alert('Invite Member clicked'), // Placeholder
    },
  ];

  if (loadingProject || loadingSummary) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="relative">
          <Spinner className="h-12 w-12" />
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (errorProject || !project) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="text-center bg-gradient-to-r from-red-50 to-red-100 dark:from-red-950/50 dark:to-red-900/50 p-8 rounded-2xl shadow-lg border border-red-200 dark:border-red-800">
          <ExclamationTriangleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-red-700 dark:text-red-300 mb-2">Failed to load project</h3>
          <p className="text-red-600 dark:text-red-400">Please try refreshing the page.</p>
        </div>
      </div>
    );
  }

  const totalMembers = members?.length || 0;
  const percentDone = summary?.percentDone || 0;
  const totalIssues = summary?.totalIssues || 0;
  const doneIssues = summary?.doneIssues || 0;

  return (
    <div className="space-y-8">
      {/* Enhanced Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-white/90 via-blue-50/60 to-purple-50/80 dark:from-gray-900/90 dark:via-blue-950/40 dark:to-purple-950/60 rounded-3xl shadow-2xl border border-white/20 dark:border-gray-800/50 p-8">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5" />
        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
            <div className="flex items-center gap-8">
              <div className="relative">
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-2xl ring-4 ring-white/50 dark:ring-gray-700/50 animate-scale-in">
                  <span className="text-white font-black text-5xl select-none">
                    {project.name?.charAt(0).toUpperCase() || '?'}
                  </span>
                </div>
                <div className="absolute -top-2 -right-2 bg-gradient-to-r from-green-400 to-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                  {currentUserRole || 'Member'}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <h1 className="text-5xl font-black bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-gray-100 dark:to-white bg-clip-text text-transparent leading-tight tracking-tight">
                    {project.name}
                  </h1>
                  <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    [{project.key}]
                  </span>
                </div>
                <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl leading-relaxed">
                  {project.description || "No description provided"}
                </p>
                <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-2">
                    <UsersIcon className="h-4 w-4" />
                    {totalMembers} Team Members
                  </span>
                  <span className="flex items-center gap-2">
                    <BriefcaseIcon className="h-4 w-4" />
                    {totalIssues} Total Issues
                  </span>
                  <span className="flex items-center gap-2">
                    <CheckCircleIcon className="h-4 w-4" />
                    {percentDone}% Complete
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-white/20 dark:border-gray-700/50">
                  <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    {totalIssues}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Total Issues</div>
                </div>
                <div className="text-center p-4 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-white/20 dark:border-gray-700/50">
                  <div className="text-3xl font-bold bg-gradient-to-r from-green-500 to-emerald-600 bg-clip-text text-transparent">
                    {doneIssues}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Completed</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            label: 'Total Issues',
            value: totalIssues,
            icon: <BriefcaseSolid className="h-6 w-6" />,
            color: 'from-blue-500 to-blue-600',
            bgColor: 'from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30'
          },
          {
            label: 'Completion Rate',
            value: `${percentDone}%`,
            icon: <TrophyIcon className="h-6 w-6" />,
            color: 'from-green-500 to-emerald-600',
            bgColor: 'from-green-100 to-emerald-200 dark:from-green-900/30 dark:to-emerald-800/30'
          },
          {
            label: 'Team Members',
            value: totalMembers,
            icon: <UsersSolid className="h-6 w-6" />,
            color: 'from-purple-500 to-purple-600',
            bgColor: 'from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/30'
          },
          {
            label: 'Active Sprint',
            value: activeSprint ? 'Active' : 'None',
            icon: <RocketLaunchSolid className="h-6 w-6" />,
            color: activeSprint ? 'from-orange-500 to-red-600' : 'from-gray-500 to-gray-600',
            bgColor: activeSprint ? 'from-orange-100 to-red-200 dark:from-orange-900/30 dark:to-red-800/30' : 'from-gray-100 to-gray-200 dark:from-gray-900/30 dark:to-gray-800/30'
          },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="group bg-gradient-to-r from-white/80 via-white/60 to-white/80 dark:from-gray-800/80 dark:via-gray-700/60 dark:to-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 relative overflow-hidden animate-fade-in-up"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/20 via-purple-50/10 to-blue-50/20 dark:from-blue-950/10 dark:via-purple-950/5 dark:to-blue-950/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <div className="relative z-10 flex items-center gap-4">
              <div className={`p-4 rounded-2xl bg-gradient-to-br ${stat.bgColor} shadow-lg`}>
                <div className={`text-white ${stat.color.includes('gray') ? 'text-gray-600' : ''}`}>
                  {stat.icon}
                </div>
              </div>
              <div>
                <div className={`text-3xl font-black bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
                  {stat.value}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 font-semibold mt-1">
                  {stat.label}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Enhanced Issue Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Donut Chart */}
        <div className="bg-gradient-to-r from-white/80 via-white/60 to-white/80 dark:from-gray-800/80 dark:via-gray-700/60 dark:to-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/50 p-8 animate-fade-in-up">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
              Issue Breakdown
            </h3>
            <ChartBarIcon className="h-8 w-8 text-blue-500" />
          </div>

          {donutData.length === 0 ? (
            <div className="text-center py-12">
              <BriefcaseIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No issues to display</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={4}
                    label={({ name, value }) => `${name}: ${value}`}
                    isAnimationActive
                    onClick={(_, idx) => setSelectedStatus(donutData[idx].name)}
                    cursor="pointer"
                  >
                    {donutData.map((entry) => (
                      <Cell
                        key={`cell-${entry.name}`}
                        fill={statusColors[entry.name] || '#6b7280'}
                        stroke={selectedStatus === entry.name ? '#2563eb' : '#fff'}
                        strokeWidth={selectedStatus === entry.name ? 4 : 2}
                        style={{
                          filter: selectedStatus === entry.name ? 'drop-shadow(0 0 12px #2563eb)' : undefined
                        }}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [`${value}`, `${name}`]}
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: 'none',
                      borderRadius: '12px',
                      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>

              {selectedStatus && (
                <button
                  className="mt-6 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 flex items-center gap-2"
                  onClick={() => setSelectedStatus(null)}
                >
                  <EyeIcon className="h-4 w-4" />
                  Clear Filter: {selectedStatus}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="bg-gradient-to-r from-white/80 via-white/60 to-white/80 dark:from-gray-800/80 dark:via-gray-700/60 dark:to-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/50 p-8 animate-fade-in-up">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
              Progress Overview
            </h3>
            <ArrowTrendingUpIcon className="h-8 w-8 text-green-500" />
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-gray-700 dark:text-gray-300">Overall Progress</span>
                <span className="text-2xl font-bold bg-gradient-to-r from-green-500 to-emerald-600 bg-clip-text text-transparent">
                  {percentDone}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden shadow-inner">
                <div
                  className="h-4 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-1000 ease-out shadow-lg"
                  style={{ width: `${percentDone}%` }}
                />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-gray-700 dark:text-gray-300">Status Breakdown</h4>
              <div className="space-y-2">
                {Object.entries(statusCounts).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between p-3 bg-white/50 dark:bg-gray-700/50 rounded-xl border border-white/20 dark:border-gray-600/50">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: statusColors[status] || '#6b7280' }}
                      />
                      <span className="font-medium text-gray-700 dark:text-gray-300">{status}</span>
                    </div>
                    <span className="font-bold text-gray-900 dark:text-white">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Active Sprint Card */}
      <div className="animate-fade-in-up">
        {loadingActiveSprint ? (
          <div className="bg-gradient-to-r from-white/80 via-white/60 to-white/80 dark:from-gray-800/80 dark:via-gray-700/60 dark:to-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/50 p-8 flex items-center justify-center">
            <Spinner className="h-8 w-8" />
          </div>
        ) : errorActiveSprint ? (
          <div className="bg-gradient-to-r from-red-50 to-red-100 dark:from-red-950/50 dark:to-red-900/50 rounded-2xl shadow-xl border border-red-200 dark:border-red-800 p-8 text-center">
            <ExclamationTriangleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-red-700 dark:text-red-300 mb-2">Failed to load active sprint</h3>
            <p className="text-red-600 dark:text-red-400">Please try refreshing the page.</p>
          </div>
        ) : activeSprint ? (
          <div className="bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 text-white shadow-2xl rounded-2xl p-8 relative overflow-hidden animate-fade-in-up">
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-white/5 to-white/10" />
            <div className="relative z-10">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <RocketLaunchIcon className="h-8 w-8" />
                    <h3 className="text-2xl font-bold">Active Sprint</h3>
                  </div>
                  <h2 className="text-4xl font-black mb-2">{activeSprint.name}</h2>
                  {activeSprint.goal && (
                    <p className="text-lg text-white/90 max-w-2xl">Goal: {activeSprint.goal}</p>
                  )}
                  <div className="flex items-center gap-6 text-sm text-white/80">
                    {activeSprint.startDate && activeSprint.endDate ? (
                      <span className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {new Date(activeSprint.startDate).toLocaleDateString()} - {new Date(activeSprint.endDate).toLocaleDateString()}
                      </span>
                    ) : (
                      <span>No dates set</span>
                    )}
                  </div>

                  {/* Enhanced Progress Bar */}
                  {loadingSprintIssues ? (
                    <div className="w-full bg-white/30 rounded-full h-4 mt-4 animate-pulse" />
                  ) : (
                    (() => {
                      const total = sprintIssues?.length || 0;
                      const done = sprintIssues?.filter(i => i.status === 'Done').length || 0;
                      const percent = total ? Math.round((done / total) * 100) : 0;
                      return (
                        <div className="space-y-2 mt-4">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold">Sprint Progress</span>
                            <span className="text-lg font-bold">{percent}%</span>
                          </div>
                          <div className="w-full bg-white/30 rounded-full h-4 overflow-hidden shadow-inner">
                            <div
                              className="bg-white/90 h-4 rounded-full transition-all duration-1000 ease-out shadow-lg"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <div className="text-sm text-white/80">
                            {done} of {total} issues completed
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>

                <div className="flex flex-col gap-4">
                  <Link href={`./sprints`}>
                    <Button className="bg-white/90 text-blue-700 font-bold px-8 py-4 rounded-xl shadow-lg hover:bg-white hover:shadow-xl transform hover:scale-105 transition-all duration-300">
                      <RocketLaunchIcon className="h-5 w-5 mr-2" />
                      Go to Sprint
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-gray-200 via-gray-300 to-gray-400 text-gray-700 shadow-2xl rounded-2xl p-8 animate-fade-in-up">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <ClockIcon className="h-8 w-8" />
                  <h3 className="text-2xl font-bold">No Active Sprint</h3>
                </div>
                <p className="text-lg max-w-2xl">Start a sprint to begin tracking progress and organizing your work!</p>
              </div>

              {['Super-Admin', 'ProjectLead'].includes(currentUserRole ?? '') && (
                <Link href={`./sprints`}>
                  <Button className="bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300">
                    <PlusIcon className="h-5 w-5 mr-2" />
                    Start Sprint
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Recent Activity Timeline */}
      <div className="animate-fade-in-up">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
            Recent Activity
          </h3>
          <FireIcon className="h-8 w-8 text-orange-500" />
        </div>

        <div className="bg-gradient-to-r from-white/80 via-white/60 to-white/80 dark:from-gray-800/80 dark:via-gray-700/60 dark:to-gray-800/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/50 overflow-hidden">
          {loadingActivity ? (
            <div className="p-8 text-center">
              <Spinner className="h-8 w-8 mx-auto" />
            </div>
          ) : errorActivity ? (
            <div className="p-8 text-center">
              <ExclamationTriangleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <p className="text-red-600 dark:text-red-400">{errorActivity}</p>
            </div>
          ) : (Array.isArray(activity) ? activity : []).length === 0 ? (
            <div className="p-8 text-center">
              <ClockIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No recent activity</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {(Array.isArray(activity) ? activity : []).map((rev, index) => {
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
                    className={`group p-6 transition-all duration-300 cursor-pointer hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 dark:hover:from-blue-900/20 dark:hover:to-purple-900/20 focus:bg-blue-100 dark:focus:bg-blue-900/30 outline-none animate-fade-in-up`}
                    style={{ animationDelay: `${index * 100}ms` }}
                    tabIndex={href ? 0 : -1}
                    onClick={() => href && router.push(href)}
                    onKeyDown={e => href && (e.key === 'Enter' || e.key === ' ') && router.push(href)}
                    aria-label={href ? `Go to ${rev.entityType}` : undefined}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                        {rev.action === 'CREATE' ? (
                          <PlusIcon className="h-6 w-6 text-green-500" />
                        ) : rev.action === 'UPDATE' ? (
                          <SparklesIcon className="h-6 w-6 text-yellow-500" />
                        ) : rev.action === 'DELETE' ? (
                          <ArrowRightOnRectangleIcon className="h-6 w-6 text-red-500" />
                        ) : (
                          <SparklesIcon className="h-6 w-6 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            {String(rev.action)}
                          </span>
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold">
                            {String(rev.entityType)}
                          </span>
                        </div>
                        <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {String(
                            typeof rev.snapshot === 'object' && rev.snapshot !== null && 'title' in rev.snapshot ? rev.snapshot.title :
                              typeof rev.snapshot === 'object' && rev.snapshot !== null && 'name' in rev.snapshot ? rev.snapshot.name :
                                rev.entityId || ''
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
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
                      {href && (
                        <div className="flex-shrink-0">
                          <ArrowRightOnRectangleIcon className="h-5 w-5 text-gray-400 group-hover:text-blue-500 transition-colors duration-300" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Speed Dial FAB */}
      {(currentUserRole === 'Super-Admin' || currentUserRole === 'ProjectLead') && (
        <SpeedDialFAB actions={actions} />
      )}
    </div>
  );
} 