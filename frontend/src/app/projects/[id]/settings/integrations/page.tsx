'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Typography from '@/components/Typography';
import { LinkIcon, ArrowPathIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { apiClient } from '@/lib/api-client';

interface Repository {
    full_name: string;
    name: string;
    private: boolean;
    description: string | null;
}

interface ProjectLink {
    repositoryFullName: string;
    projectKey: string;
    linkedAt: string;
}

interface GitHubReposResponse {
    connected: boolean;
    integrationId?: string;
    repositories: Repository[];
    hasDisabledIntegration?: boolean;
}

interface ProjectLinkResponse {
    connected: boolean;
    integrationId?: string;
    link: ProjectLink | null;
}

interface GitHubSetupResponse {
    installUrl: string;
    appId: string;
    configured: boolean;
}

/**
 * Project Integrations Settings Page
 *
 * Manages GitHub and other third-party integrations for a project.
 * Uses centralized apiClient for all API calls.
 */
export default function ProjectIntegrationsPage() {
    const params = useParams();
    const projectId = params.id as string;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [repos, setRepos] = useState<Repository[]>([]);
    const [gitHubConnected, setGitHubConnected] = useState(false);
    const [hasDisabledIntegration, setHasDisabledIntegration] = useState(false);
    const [currentLink, setCurrentLink] = useState<ProjectLink | null>(null);
    const [selectedRepo, setSelectedRepo] = useState<string>('');
    const [projectKey, setProjectKey] = useState<string>('');
    const [saving, setSaving] = useState(false);

    // Fetch initial data
    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);
                setError(null);

                // Fetch repos and current link in parallel
                const [reposData, linkData] = await Promise.all([
                    apiClient.get<GitHubReposResponse>('/api/integrations/github/repos'),
                    apiClient.get<ProjectLinkResponse>(`/api/integrations/projects/${projectId}/github/link`),
                ]);

                console.log('GitHub repos response:', reposData);

                setGitHubConnected(reposData.connected);
                setRepos(reposData.repositories || []);
                setHasDisabledIntegration(reposData.hasDisabledIntegration || false);
                setCurrentLink(linkData.link);

                if (linkData.link) {
                    setSelectedRepo(linkData.link.repositoryFullName);
                    setProjectKey(linkData.link.projectKey);
                }
            } catch (err) {
                console.error('Failed to fetch integration data:', err);
                setError('Failed to load integration settings');
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [projectId]);

    const handleConnectGitHub = async () => {
        try {
            setError(null);
            const data = await apiClient.get<GitHubSetupResponse>('/api/integrations/github-app/setup');

            // Redirect to GitHub App installation page
            if (data.installUrl) {
                window.location.href = data.installUrl;
            } else {
                setError('Invalid response from server');
            }
        } catch (err) {
            console.error('Failed to connect GitHub:', err);
            setError('Failed to connect to GitHub. Please try again.');
        }
    };

    const handleDisableGitHub = async () => {
        try {
            setSaving(true);
            setError(null);

            await apiClient.post('/api/integrations/github/disable', {});

            // Mark as disabled (not fully disconnected)
            setGitHubConnected(false);
            setHasDisabledIntegration(true);
            console.log('GitHub disabled successfully');
        } catch (err) {
            console.error('Failed to disable GitHub:', err);
            setError(err instanceof Error ? err.message : 'Failed to disable GitHub');
        } finally {
            setSaving(false);
        }
    };

    const handleEnableGitHub = async () => {
        try {
            setSaving(true);
            setError(null);

            await apiClient.post('/api/integrations/github/enable', {});

            // Re-enable and refresh repos
            setGitHubConnected(true);
            setHasDisabledIntegration(false);

            // Refresh repos after enabling
            const reposData = await apiClient.get<GitHubReposResponse>('/api/integrations/github/repos');
            setRepos(reposData.repositories || []);

            console.log('GitHub enabled successfully');
        } catch (err) {
            console.error('Failed to enable GitHub:', err);
            setError(err instanceof Error ? err.message : 'Failed to enable GitHub');
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveGitHub = async () => {
        if (!confirm('Are you sure you want to REMOVE the GitHub integration? This will fully uninstall the GitHub App from your account and cannot be undone.')) {
            return;
        }

        try {
            setSaving(true);
            setError(null);

            await apiClient.delete('/api/integrations/github/remove');

            // Fully reset state
            setGitHubConnected(false);
            setHasDisabledIntegration(false);
            setRepos([]);
            setCurrentLink(null);
            setSelectedRepo('');
            setProjectKey('');

            console.log('GitHub removed successfully');
        } catch (err) {
            console.error('Failed to remove GitHub:', err);
            setError(err instanceof Error ? err.message : 'Failed to remove GitHub');
        } finally {
            setSaving(false);
        }
    };

    const handleLinkRepository = async () => {
        if (!selectedRepo || !projectKey) {
            setError('Please select a repository and enter a project key');
            return;
        }

        try {
            setSaving(true);
            setError(null);

            const data = await apiClient.post<{ link: ProjectLink }>(
                `/api/integrations/projects/${projectId}/github/link`,
                {
                    repositoryFullName: selectedRepo,
                    projectKey: projectKey.toUpperCase(),
                }
            );

            setCurrentLink(data.link);
        } catch (err) {
            console.error('Failed to link repository:', err);
            setError('Failed to link repository');
        } finally {
            setSaving(false);
        }
    };

    const handleUnlinkRepository = async () => {
        try {
            setSaving(true);
            setError(null);

            await apiClient.delete(`/api/integrations/projects/${projectId}/github/link`);

            setCurrentLink(null);
            setSelectedRepo('');
        } catch (err) {
            console.error('Failed to unlink repository:', err);
            setError('Failed to unlink repository');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <ArrowPathIcon className="h-8 w-8 animate-spin text-primary-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <Typography variant="h3">Integrations</Typography>
                <Typography variant="body" color="muted">
                    Connect external services to this project
                </Typography>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
                    <ExclamationCircleIcon className="h-5 w-5 text-red-500 shrink-0" />
                    <Typography variant="body-sm" className="text-red-700">{error}</Typography>
                </div>
            )}

            {/* GitHub Integration Card */}
            <Card className="p-6">
                <div className="flex items-start gap-4">
                    {/* GitHub Icon */}
                    <div className="w-12 h-12 bg-neutral-900 dark:bg-neutral-700 rounded-lg flex items-center justify-center shrink-0">
                        <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                        </svg>
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                            <Typography variant="h4">GitHub</Typography>
                            {gitHubConnected ? (
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                                        <CheckCircleIcon className="h-3.5 w-3.5" />
                                        Connected
                                    </span>
                                    <button
                                        onClick={handleDisableGitHub}
                                        disabled={saving}
                                        className="text-xs text-yellow-600 hover:text-yellow-700 hover:underline disabled:opacity-50"
                                    >
                                        {saving ? 'Disabling...' : 'Disable'}
                                    </button>
                                    <span className="text-neutral-300">|</span>
                                    <button
                                        onClick={handleRemoveGitHub}
                                        disabled={saving}
                                        className="text-xs text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-neutral-100 text-neutral-600 text-xs font-medium">
                                    Not Connected
                                </span>
                            )}
                        </div>

                        <Typography variant="body-sm" color="muted" className="mb-4">
                            Link a GitHub repository to enable Magic Words (e.g., &quot;Fixes #123&quot; auto-closes issues).
                        </Typography>

                        {!gitHubConnected ? (
                            /* Not connected - show enable or connect button */
                            hasDisabledIntegration ? (
                                <div className="flex items-center gap-3">
                                    <Button onClick={handleEnableGitHub} disabled={saving}>
                                        <ArrowPathIcon className="h-4 w-4 mr-2" />
                                        {saving ? 'Enabling...' : 'Enable Integration'}
                                    </Button>
                                    <Typography variant="body-sm" color="muted">
                                        or
                                    </Typography>
                                    <button
                                        onClick={handleRemoveGitHub}
                                        disabled={saving}
                                        className="text-sm text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
                                    >
                                        Remove completely
                                    </button>
                                </div>
                            ) : (
                                <Button onClick={handleConnectGitHub}>
                                    <LinkIcon className="h-4 w-4 mr-2" />
                                    Connect GitHub
                                </Button>
                            )
                        ) : currentLink ? (
                            /* Connected and linked - show current link */
                            <div className="space-y-4">
                                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Typography variant="body-sm" className="font-medium text-green-800 dark:text-green-200">
                                                Linked Repository
                                            </Typography>
                                            <Typography variant="body" className="text-green-900 dark:text-green-100 font-mono">
                                                {currentLink.repositoryFullName}
                                            </Typography>
                                            <Typography variant="body-sm" color="muted" className="mt-1">
                                                Project Key: <span className="font-medium">{currentLink.projectKey}</span>
                                            </Typography>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleUnlinkRepository}
                                            disabled={saving}
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        >
                                            {saving ? 'Unlinking...' : 'Unlink'}
                                        </Button>
                                    </div>
                                </div>

                                <Typography variant="body-sm" color="muted">
                                    <strong>Magic Words enabled:</strong> Commits with &quot;Fixes {currentLink.projectKey}-123&quot;
                                    or &quot;closes #&#123;number&#125;&quot; will auto-close matching issues.
                                </Typography>
                            </div>
                        ) : (
                            /* Connected but not linked - show link form */
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Repository Dropdown */}
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                            Repository
                                        </label>
                                        <select
                                            value={selectedRepo}
                                            onChange={(e) => setSelectedRepo(e.target.value)}
                                            className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        >
                                            <option value="">Select a repository</option>
                                            {repos.map((repo) => (
                                                <option key={repo.full_name} value={repo.full_name}>
                                                    {repo.full_name} {repo.private ? '🔒' : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Project Key Input */}
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                                            Project Key
                                        </label>
                                        <input
                                            type="text"
                                            value={projectKey}
                                            onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
                                            placeholder="e.g., ZEN"
                                            maxLength={10}
                                            className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent uppercase"
                                        />
                                        <Typography variant="body-sm" color="muted" className="mt-1">
                                            Used for issue references like ZEN-123
                                        </Typography>
                                    </div>
                                </div>

                                <Button
                                    onClick={handleLinkRepository}
                                    disabled={!selectedRepo || !projectKey || saving}
                                >
                                    {saving ? (
                                        <>
                                            <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                                            Linking...
                                        </>
                                    ) : (
                                        <>
                                            <LinkIcon className="h-4 w-4 mr-2" />
                                            Link Repository
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            {/* Future: Slack Integration Placeholder */}
            <Card className="p-6 opacity-60">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-[#4A154B] rounded-lg flex items-center justify-center shrink-0">
                        <span className="text-white text-xl font-bold">#</span>
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                            <Typography variant="h4">Slack</Typography>
                            <span className="inline-flex items-center px-2 py-1 rounded-full bg-neutral-100 text-neutral-500 text-xs font-medium">
                                Coming Soon
                            </span>
                        </div>
                        <Typography variant="body-sm" color="muted">
                            Link a Slack channel to receive notifications when issues are created or updated.
                        </Typography>
                    </div>
                </div>
            </Card>
        </div>
    );
}
