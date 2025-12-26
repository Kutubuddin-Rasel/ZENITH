"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import Card from './Card';
import Button from './Button';
import Typography from './Typography';
import {
    DocumentPlusIcon,
    UserPlusIcon,
    RocketLaunchIcon,
    QueueListIcon,
} from '@heroicons/react/24/outline';

interface EmptyProjectHeroProps {
    projectId: string;
    onCreateIssue: () => void;
    canManageProject: boolean;
}

/**
 * EmptyProjectHero - A beautiful, actionable hero for new projects with 0 issues.
 * 
 * Displays when a project has no issues yet, providing:
 * - Clear messaging about what to do
 * - Primary CTA to create first issue
 * - Quick action links for common tasks
 */
export default function EmptyProjectHero({
    projectId,
    onCreateIssue,
    canManageProject
}: EmptyProjectHeroProps) {
    const router = useRouter();

    const quickActions = [
        {
            label: 'Invite Team',
            icon: UserPlusIcon,
            onClick: () => router.push(`/projects/${projectId}/team`),
            visible: canManageProject,
        },
        {
            label: 'Plan Sprint',
            icon: RocketLaunchIcon,
            onClick: () => router.push(`/projects/${projectId}/sprints`),
            visible: canManageProject,
        },
        {
            label: 'Go to Backlog',
            icon: QueueListIcon,
            onClick: () => router.push(`/projects/${projectId}/backlog`),
            visible: true,
        },
    ];

    return (
        <Card className="p-12">
            <div className="text-center max-w-lg mx-auto">
                {/* Hero Icon */}
                <div className="w-20 h-20 mx-auto mb-6 bg-primary-50 dark:bg-primary-900/30 rounded-2xl flex items-center justify-center">
                    <DocumentPlusIcon className="h-10 w-10 text-primary-600 dark:text-primary-400" />
                </div>

                {/* Hero Message */}
                <Typography variant="h2" className="text-neutral-900 dark:text-white mb-3">
                    No issues yet
                </Typography>
                <Typography variant="body" className="text-neutral-600 dark:text-neutral-400 mb-8">
                    Start tracking work by creating your first issue. Issues help your team organize,
                    prioritize, and track progress on tasks and features.
                </Typography>

                {/* Primary CTA */}
                {canManageProject && (
                    <Button
                        onClick={onCreateIssue}
                        size="lg"
                        className="mb-8 shadow-lg shadow-primary-500/20"
                    >
                        <DocumentPlusIcon className="h-5 w-5 mr-2" />
                        Create First Issue
                    </Button>
                )}

                {/* Divider */}
                <div className="border-t border-neutral-200 dark:border-neutral-700 my-8" />

                {/* Quick Actions */}
                <Typography variant="body-sm" className="text-neutral-500 dark:text-neutral-400 mb-4 uppercase tracking-wide font-semibold">
                    Quick Actions
                </Typography>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                    {quickActions
                        .filter(action => action.visible)
                        .map((action) => (
                            <button
                                key={action.label}
                                onClick={action.onClick}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors text-sm font-medium"
                            >
                                <action.icon className="h-4 w-4" />
                                {action.label}
                            </button>
                        ))}
                </div>
            </div>
        </Card>
    );
}
