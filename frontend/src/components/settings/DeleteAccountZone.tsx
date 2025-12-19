"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useDeleteAccount } from '@/hooks/useProfile';
import { ExclamationTriangleIcon, TrashIcon } from '@heroicons/react/24/outline';

/**
 * Danger Zone component for account deletion
 * Requires typing "DELETE" to confirm
 */
export default function DeleteAccountZone() {
    const { user, logout } = useAuth();
    const router = useRouter();
    const { showToast } = useToast();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const { mutate: deleteAccount, isPending } = useDeleteAccount(user?.id);

    const handleDelete = () => {
        if (confirmText !== 'DELETE') {
            showToast('Please type DELETE to confirm', 'error');
            return;
        }

        deleteAccount(undefined, {
            onSuccess: () => {
                showToast('Account deleted successfully', 'success');
                logout();
                router.push('/auth/login');
            },
            onError: (err) => {
                showToast(
                    err instanceof Error ? err.message : 'Failed to delete account',
                    'error'
                );
            },
        });
    };

    return (
        <>
            <Card className="p-6 border-2 border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20">
                <div className="flex items-center gap-3 mb-4">
                    <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                    <h3 className="text-lg font-semibold text-red-700 dark:text-red-400">
                        Danger Zone
                    </h3>
                </div>
                <p className="text-sm text-red-600 dark:text-red-400 mb-4">
                    Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                <Button
                    variant="secondary"
                    className="w-full justify-center bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800"
                    onClick={() => setIsModalOpen(true)}
                >
                    <TrashIcon className="h-4 w-4 mr-2" />
                    Delete Personal Account
                </Button>
            </Card>

            <Modal
                open={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setConfirmText('');
                }}
                title="Delete Account"
            >
                <div className="space-y-6">
                    <div className="flex items-start gap-4 p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                        <ExclamationTriangleIcon className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-semibold text-red-700 dark:text-red-400">
                                This action cannot be undone
                            </h4>
                            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                                This will permanently delete your account, all your projects, issues, and settings.
                                You will lose access to all workspaces you own.
                            </p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Type <span className="font-bold text-red-600">DELETE</span> to confirm
                        </label>
                        <Input
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            placeholder="Type DELETE"
                            className="font-mono"
                        />
                    </div>

                    <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setIsModalOpen(false);
                                setConfirmText('');
                            }}
                            disabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleDelete}
                            loading={isPending}
                            disabled={confirmText !== 'DELETE' || isPending}
                            className="bg-red-600 hover:bg-red-700 text-white disabled:bg-red-300 disabled:cursor-not-allowed"
                        >
                            Delete My Account
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
}
