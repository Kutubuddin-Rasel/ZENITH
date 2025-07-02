"use client";
import React, { useEffect, useState, useContext, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../hooks/useProject";
import { useProjectIssues } from "../../../hooks/useProjectIssues";
import { useProjectSummary } from '../../../hooks/useProject';
import Card from "../../../components/Card";
import Spinner from "../../../components/Spinner";
import { getSocket } from '../../../lib/socket';
import Link from 'next/link';
import { useUpdateProject, useArchiveProject } from '../../../hooks/useProject';
import Button from "@/components/Button";
import Input from "@/components/Input";
import Typography from "@/components/Typography";
import {
  useProjectMembers,
  useAddProjectMember,
  useRemoveProjectMember,
  useUpdateProjectMemberRole,
  ProjectMember,
} from '../../../hooks/useProject';
import Modal from '../../../components/Modal';
import { useToast } from '../../../context/ToastContext';
import Image from 'next/image';
import { useAuth } from "@/context/AuthContext";
import { 
  PlusIcon, 
  BriefcaseIcon, 
  SparklesIcon, 
  UserIcon, 
  Cog6ToothIcon, 
  ArrowRightOnRectangleIcon, 
  UserPlusIcon, 
  DocumentPlusIcon, 
  PencilSquareIcon,
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  RocketLaunchIcon,
  FireIcon,
  TrophyIcon,
  UsersIcon,
  EyeIcon,
  ArrowTrendingUpIcon
} from "@heroicons/react/24/outline";
import { 
  BriefcaseIcon as BriefcaseSolid,
  SparklesIcon as SparklesSolid,
  UserIcon as UserSolid,
  ChartBarIcon as ChartBarSolid,
  ClockIcon as ClockSolid,
  CheckCircleIcon as CheckCircleSolid,
  ExclamationTriangleIcon as ExclamationTriangleSolid,
  CalendarIcon as CalendarSolid,
  RocketLaunchIcon as RocketLaunchSolid,
  FireIcon as FireSolid,
  TrophyIcon as TrophySolid,
  UsersIcon as UsersSolid,
  EyeIcon as EyeSolid,
  ArrowTrendingUpIcon as ArrowTrendingUpSolid
} from "@heroicons/react/24/solid";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useActiveSprint } from '../../../hooks/useSprints';
import { useSprintIssues } from '../../../hooks/useSprintIssues';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import SpeedDialFAB, { SpeedDialAction } from '@/components/SpeedDialFAB';
import { PencilIcon } from '@heroicons/react/24/solid';

function useProjectActivity(projectId: string) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL;
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    fetch(`${API_URL}/projects/${projectId}/activity`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch activity');
        return res.json();
      })
      .then(setActivity)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [projectId, API_URL]);
  return { activity, loading, error };
}

export default function ProjectDashboard() {
  const params = useParams();
  const id = params.id as string;
  const { project, isLoading: loadingProject, isError: errorProject, currentUserRole } = useProject(id);
  const { data: summary, isLoading: loadingSummary, isError: errorSummary, refetch: refetchSummary } = useProjectSummary(id);
  const { issues, isLoading: loadingIssues, isError: errorIssues } = useProjectIssues(id);
  const updateProject = useUpdateProject(id);
  const archiveProject = useArchiveProject(id);
  const [editing, setEditing] = React.useState(false);
  const [formState, setFormState] = React.useState({ name: '', description: '' });
  const { data: members, isLoading: loadingMembers, isError: errorMembers } = useProjectMembers(id);
  const addMember = useAddProjectMember(id);
  const removeMember = useRemoveProjectMember(id);
  const updateMemberRole = useUpdateProjectMemberRole(id);
  const [inviteState, setInviteState] = React.useState({ userId: '', roleName: 'Developer' });
  const { showToast } = useToast();
  const [removeTarget, setRemoveTarget] = React.useState<ProjectMember | null>(null);
  const { activity, loading: loadingActivity, error: errorActivity } = useProjectActivity(id);
  const { user } = useAuth();
  const router = useRouter();
  const { activeSprint, isLoading: loadingActiveSprint, isError: errorActiveSprint } = useActiveSprint(id);
  const { issues: sprintIssues, isLoading: loadingSprintIssues } = useSprintIssues(id, activeSprint?.id || '');
  const [selectedStatus, setSelectedStatus] = React.useState<string | null>(null);
  const [fabOpen, setFabOpen] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);

  React.useEffect(() => {
    if (project) setFormState({ name: project.name, description: project.description || '' });
  }, [project]);

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
    Todo: '#6b7280', // gray-500
    Backlog: '#3b82f6', // blue-500
    Blocked: '#ef4444', // red-500
    Review: '#8b5cf6', // violet-500
  };

  const statusIcons: Record<string, React.ReactElement> = {
    Done: <CheckCircleSolid className="h-4 w-4" />,
    InProgress: <ClockSolid className="h-4 w-4" />,
    Todo: <EyeSolid className="h-4 w-4" />,
    Backlog: <BriefcaseSolid className="h-4 w-4" />,
    Blocked: <ExclamationTriangleSolid className="h-4 w-4" />,
    Review: <SparklesSolid className="h-4 w-4" />,
  };

  const donutData = Object.entries(summary?.statusCounts || {}).map(([status, count]) => ({ name: status, value: count }));

  // Recent activity: show 5 most recently updated issues, filtered by selectedStatus if set
  const filteredIssues = selectedStatus
    ? issues?.filter((issue) => issue.status === selectedStatus)
    : issues;
  const recentActivity = filteredIssues
    ? [...filteredIssues].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5)
    : [];

  // FAB Quick Actions
  const canQuickAction = ["Super-Admin", "ProjectLead"].includes(currentUserRole ?? '');
  const canEditProject = ["Super-Admin", "ProjectLead"].includes(currentUserRole ?? '');

  const actions: SpeedDialAction[] = [
    {
      icon: <PencilIcon className="h-6 w-6" />,
      label: 'Edit Project',
      onClick: () => setShowSettings(true),
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

  if (loadingProject || loadingSummary || loadingIssues) {
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
              <div className="flex items-center gap-4">
                <Typography variant="h1" className="text-gray-900 dark:text-white">
                  {project.name}
                </Typography>
                <span className="px-3 py-1 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 text-sm font-semibold rounded-full">
                  {project.key}
                </span>
              </div>
              <Typography variant="body" className="text-gray-600 dark:text-gray-400 max-w-2xl">
                {project.description || "No description provided"}
              </Typography>
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
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <Typography variant="h2" className="text-primary-600 dark:text-primary-400">
                  {totalIssues}
                </Typography>
                <Typography variant="body-sm" className="text-gray-500 dark:text-gray-400">
                  Total Issues
                </Typography>
              </div>
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <Typography variant="h2" className="text-emerald-600 dark:text-emerald-400">
                  {doneIssues}
                </Typography>
                <Typography variant="body-sm" className="text-gray-500 dark:text-gray-400">
                  Completed
                </Typography>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { 
            label: 'Total Issues', 
            value: totalIssues, 
            icon: <BriefcaseSolid className="h-6 w-6" />,
            color: 'text-blue-600 dark:text-blue-400',
            bgColor: 'bg-blue-100 dark:bg-blue-900'
          },
          { 
            label: 'Completion Rate', 
            value: `${percentDone}%`, 
            icon: <TrophySolid className="h-6 w-6" />,
            color: 'text-emerald-600 dark:text-emerald-400',
            bgColor: 'bg-emerald-100 dark:bg-emerald-900'
          },
          { 
            label: 'Team Members', 
            value: totalMembers, 
            icon: <UsersSolid className="h-6 w-6" />,
            color: 'text-purple-600 dark:text-purple-400',
            bgColor: 'bg-purple-100 dark:bg-purple-900'
          },
          { 
            label: 'Active Sprint', 
            value: activeSprint ? 'Active' : 'None', 
            icon: <RocketLaunchSolid className="h-6 w-6" />,
            color: activeSprint ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400',
            bgColor: activeSprint ? 'bg-orange-100 dark:bg-orange-900' : 'bg-gray-100 dark:bg-gray-900'
          },
        ].map((stat, i) => (
          <Card key={stat.label} className="p-6">
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
                <Typography variant="body-sm" className="text-gray-500 dark:text-gray-400 font-medium">
                  {stat.label}
                </Typography>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Issue Breakdown and Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Donut Chart */}
        <Card className="p-8">
          <div className="flex items-center justify-between mb-6">
            <Typography variant="h3" className="text-gray-900 dark:text-white">
              Issue Breakdown
            </Typography>
            <ChartBarIcon className="h-8 w-8 text-primary-600 dark:text-primary-400" />
          </div>
          {donutData.length === 0 ? (
            <div className="text-center py-12">
              <BriefcaseIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <Typography variant="body" className="text-gray-500 dark:text-gray-400">
                No issues to display
              </Typography>
            </div>
          ) : (
            <div className="flex flex-col items-center w-full">
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
                    label={false}
                    isAnimationActive
                    onClick={(_, idx) => setSelectedStatus(donutData[idx].name)}
                    cursor="pointer"
                  >
                    {donutData.map((entry, idx) => (
                      <Cell
                        key={`cell-${entry.name}`}
                        fill={statusColors[entry.name] || '#6b7280'}
                        stroke={selectedStatus === entry.name ? '#2563eb' : '#fff'}
                        strokeWidth={selectedStatus === entry.name ? 4 : 2}
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
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-4 mt-6 w-full">
                {donutData.map((entry, idx) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <span className="inline-block w-4 h-4 rounded-full" style={{ backgroundColor: statusColors[entry.name] || '#6b7280' }} />
                    <span className="font-medium text-gray-700 dark:text-gray-200">{entry.name}</span>
                    <span className="text-gray-500 dark:text-gray-400">({entry.value})</span>
                  </div>
                ))}
              </div>
              {selectedStatus && (
                <Button
                  variant="secondary"
                  className="mt-6"
                  onClick={() => setSelectedStatus(null)}
                >
                  <EyeIcon className="h-4 w-4 mr-2" />
                  Clear Filter: {selectedStatus}
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* Progress Overview */}
        <Card className="p-8">
          <div className="flex items-center justify-between mb-6">
            <Typography variant="h3" className="text-gray-900 dark:text-white">
              Progress Overview
            </Typography>
            <ArrowTrendingUpIcon className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Typography variant="body" className="font-semibold text-gray-700 dark:text-gray-300">
                  Overall Progress
                </Typography>
                <Typography variant="h3" className="text-emerald-600 dark:text-emerald-400">
                  {percentDone}%
                </Typography>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
                <div 
                  className="h-4 bg-emerald-500 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${percentDone}%` }}
                />
              </div>
            </div>
            
            <div className="space-y-3">
              <Typography variant="body" className="font-semibold text-gray-700 dark:text-gray-300">
                Status Breakdown
              </Typography>
              <div className="space-y-2">
                {Object.entries(summary?.statusCounts || {}).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: statusColors[status] || '#6b7280' }}
                      />
                      <Typography variant="body" className="font-medium text-gray-700 dark:text-gray-300">
                        {status}
                      </Typography>
                    </div>
                    <Typography variant="body" className="font-bold text-gray-900 dark:text-white">
                      {count}
                    </Typography>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

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
                  <Typography variant="h3" className="text-gray-900 dark:text-white">
                    Active Sprint
                  </Typography>
                  <span className="inline-block mt-1 px-3 py-1 text-xs font-bold rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
                    ACTIVE
                  </span>
                </div>
              </div>
              <Typography variant="h2" className="text-gray-900 dark:text-white">
                {activeSprint.name}
              </Typography>
              {activeSprint.goal && (
                <Typography variant="body" className="text-gray-600 dark:text-gray-400 italic">
                  🎯 {activeSprint.goal}
                </Typography>
              )}
              <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
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
                  <Typography variant="h4" className="text-gray-900 dark:text-white">
                    {sprintIssues?.length || 0}
                  </Typography>
                  <Typography variant="body-sm" className="text-gray-500 dark:text-gray-400">
                    Total Issues
                  </Typography>
                </div>
                <div className="flex flex-col items-center">
                  <Typography variant="h4" className="text-green-600 dark:text-green-400">
                    {sprintIssues?.filter(i => i.status === 'Done').length || 0}
                  </Typography>
                  <Typography variant="body-sm" className="text-gray-500 dark:text-gray-400">
                    Done
                  </Typography>
                </div>
                <div className="flex flex-col items-center">
                  <Typography variant="h4" className="text-orange-600 dark:text-orange-400">
                    {sprintIssues?.filter(i => i.status !== 'Done').length || 0}
                  </Typography>
                  <Typography variant="body-sm" className="text-gray-500 dark:text-gray-400">
                    Remaining
                  </Typography>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col justify-center items-center gap-8">
              {loadingSprintIssues ? (
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-6 animate-pulse" />
              ) : (
                (() => {
                  const total = sprintIssues?.length || 0;
                  const done = sprintIssues?.filter(i => i.status === 'Done').length || 0;
                  const percent = total ? Math.round((done / total) * 100) : 0;
                  return (
                    <div className="w-full max-w-xl">
                      <div className="flex justify-between items-center mb-2">
                        <Typography variant="body" className="font-semibold text-gray-700 dark:text-gray-300">
                          Sprint Progress
                        </Typography>
                        <Typography variant="h4" className="text-gray-900 dark:text-white">
                          {percent}%
                        </Typography>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-6 overflow-hidden">
                        <div 
                          className="bg-green-500 h-6 rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <Typography variant="body" className="text-gray-600 dark:text-gray-400 mt-2 text-center">
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
                <ClockIcon className="h-8 w-8 text-gray-400" />
                <Typography variant="h3" className="text-gray-900 dark:text-white">
                  No Active Sprint
                </Typography>
              </div>
              <Typography variant="body" className="text-gray-600 dark:text-gray-400 max-w-2xl">
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
          <Typography variant="h3" className="text-gray-900 dark:text-white">
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
        ) : activity.length === 0 ? (
          <div className="text-center py-12">
            <ClockIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <Typography variant="body" className="text-gray-500 dark:text-gray-400">
              No recent activity
            </Typography>
          </div>
        ) : (
          <div className="space-y-4">
            {activity.slice(0, 5).map((rev, index) => {
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
                  className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 cursor-pointer"
                  onClick={() => href && router.push(href)}
                >
                  <div className="flex-shrink-0 w-10 h-10 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center">
                    <ChartBarIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-3">
                      <Typography variant="body-sm" className="font-semibold text-primary-600 dark:text-primary-400">
                        {rev.action}
                      </Typography>
                      <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 text-xs font-semibold rounded-full">
                        {rev.entityType}
                      </span>
                    </div>
                    <Typography variant="body" className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {rev.snapshot?.title || rev.snapshot?.name || rev.entityId}
                    </Typography>
                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <UserIcon className="h-4 w-4" />
                        {rev.changedBy}
                      </span>
                      <span className="flex items-center gap-1">
                        <ClockIcon className="h-4 w-4" />
                        {new Date(rev.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Speed Dial FAB */}
      {(currentUserRole === 'Super-Admin' || currentUserRole === 'ProjectLead') && (
        <SpeedDialFAB actions={actions} />
      )}
    </div>
  );
}