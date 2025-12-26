"use client";
import React, { useState } from 'react';
import { SettingsHeader, SettingsCard } from '@/components/settings-ui';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Modal from '@/components/Modal';
import Spinner from '@/components/Spinner';
import { useToast } from '@/context/ToastContext';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/useApiKeys';
import {
    KeyIcon,
    PlusIcon,
    TrashIcon,
    ClipboardDocumentIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    ClockIcon,
} from '@heroicons/react/24/outline';

/**
 * Developer Settings Page - Personal Access Tokens (PATs)
 * 
 * Features:
 * - List all active API keys
 * - Generate new token (shown only once)
 * - Revoke tokens
 */
export default function DeveloperPage() {
    const { data: apiKeys, isLoading, isError } = useApiKeys();
    const { mutate: createKey, isPending: isCreating } = useCreateApiKey();
    const { mutate: revokeKey } = useRevokeApiKey();
    const { showToast } = useToast();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newTokenName, setNewTokenName] = useState('');
    const [newToken, setNewToken] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    const handleCreateToken = () => {
        if (!newTokenName.trim()) {
            showToast('Please enter a token name', 'error');
            return;
        }

        createKey(
            { name: newTokenName },
            {
                onSuccess: (data) => {
                    setNewToken(data.key);
                    setNewTokenName('');
                    showToast('API token created', 'success');
                },
                onError: () => {
                    showToast('Failed to create token', 'error');
                },
            }
        );
    };

    const handleCopyToken = async () => {
        if (newToken) {
            await navigator.clipboard.writeText(newToken);
            setCopied(true);
            showToast('Token copied to clipboard', 'success');
            setTimeout(() => setCopied(false), 3000);
        }
    };

    const handleRevokeToken = (id: string) => {
        setRevokingId(id);
        revokeKey(id, {
            onSuccess: () => {
                showToast('Token revoked', 'success');
                setRevokingId(null);
            },
            onError: () => {
                showToast('Failed to revoke token', 'error');
                setRevokingId(null);
            },
        });
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setNewToken(null);
        setNewTokenName('');
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-96">
                <Spinner className="h-10 w-10" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <SettingsHeader
                title="Developer Settings"
                description="Manage API tokens and developer access."
            >
                <Button onClick={() => setIsModalOpen(true)} className="gap-2">
                    <PlusIcon className="h-5 w-5" />
                    Generate New Token
                </Button>
            </SettingsHeader>

            {/* Info Card */}
            <SettingsCard
                title="Personal Access Tokens"
                description="Tokens allow you to authenticate with the Zenith API for scripts and integrations."
                className="!bg-blue-50/50 dark:!bg-blue-900/10 !border-blue-200 dark:!border-blue-800"
            >
                <div className="flex items-start gap-3 text-sm text-blue-900 dark:text-blue-200">
                    <KeyIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                    <div>
                        <p>
                            Tokens are shown only once upon creation. Store them securely.
                        </p>
                    </div>
                </div>
            </SettingsCard>

            {/* Tokens List */}
            <SettingsCard
                title="Active Tokens"
                description="Your generated API keys."
            >
                {isError ? (
                    <div className="text-center py-8 text-neutral-500">
                        Failed to load tokens
                    </div>
                ) : !apiKeys || apiKeys.length === 0 ? (
                    <div className="text-center py-12">
                        <KeyIcon className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
                        <p className="text-neutral-500">No API tokens yet</p>
                        <p className="text-sm text-neutral-400 mt-1">
                            Generate your first token to get started
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {apiKeys.map((key) => (
                            <div
                                key={key.id}
                                className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-100 dark:border-neutral-700 hover:border-neutral-200 dark:hover:border-neutral-600 transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg">
                                        <KeyIcon className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
                                    </div>
                                    <div>
                                        <p className="font-medium text-neutral-900 dark:text-white">
                                            {key.name}
                                        </p>
                                        <div className="flex items-center gap-4 text-xs text-neutral-500 mt-1">
                                            <span className="font-mono bg-neutral-100 dark:bg-neutral-900 px-1.5 py-0.5 rounded text-xs border border-neutral-200 dark:border-neutral-700">
                                                {key.keyPrefix}•••••••
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <ClockIcon className="h-3 w-3" />
                                                Created {formatDate(key.createdAt)}
                                            </span>
                                            {key.lastUsedAt && (
                                                <span>Last used {formatDate(key.lastUsedAt)}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleRevokeToken(key.id)}
                                    loading={revokingId === key.id}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border-transparent hover:border-red-100"
                                >
                                    <TrashIcon className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </SettingsCard>

            {/* Create Token Modal */}
            <Modal open={isModalOpen} onClose={closeModal} title="Generate New Token">
                <div className="space-y-6 pt-2">
                    {!newToken ? (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                                    Token Name
                                </label>
                                <Input
                                    value={newTokenName}
                                    onChange={(e) => setNewTokenName(e.target.value)}
                                    placeholder="e.g., CI/CD Pipeline, Local Development"
                                    autoFocus
                                />
                                <p className="text-xs text-neutral-500 mt-2">
                                    Give your token a descriptive name to identify its purpose.
                                </p>
                            </div>

                            <div className="flex gap-3 justify-end pt-4 border-t border-neutral-200 dark:border-neutral-700">
                                <Button variant="secondary" onClick={closeModal}>
                                    Cancel
                                </Button>
                                <Button onClick={handleCreateToken} loading={isCreating}>
                                    Generate Token
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-start gap-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                                <ExclamationTriangleIcon className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="font-semibold text-amber-700 dark:text-amber-400">
                                        Copy this token now!
                                    </h4>
                                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                                        You won&apos;t be able to see it again. Store it somewhere safe.
                                    </p>
                                </div>
                            </div>

                            <div className="relative">
                                <div className="p-4 bg-neutral-100 dark:bg-neutral-800 rounded-xl font-mono text-sm break-all border border-neutral-200 dark:border-neutral-700">
                                    {newToken}
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleCopyToken}
                                    className="absolute top-2 right-2 gap-2"
                                >
                                    {copied ? (
                                        <>
                                            <CheckCircleIcon className="h-4 w-4 text-green-500" />
                                            Copied
                                        </>
                                    ) : (
                                        <>
                                            <ClipboardDocumentIcon className="h-4 w-4" />
                                            Copy
                                        </>
                                    )}
                                </Button>
                            </div>

                            <div className="flex justify-end pt-4 border-t border-neutral-200 dark:border-neutral-700">
                                <Button onClick={closeModal}>
                                    Done
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </Modal>
        </div>
    );
}
