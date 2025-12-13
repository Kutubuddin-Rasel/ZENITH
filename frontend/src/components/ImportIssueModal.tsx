import React, { useState, useRef } from 'react';
import { Dialog } from '@headlessui/react';
import { XMarkIcon, ArrowUpTrayIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import Button from './Button';
import Spinner from './Spinner';

interface ImportIssueModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    onSuccess: () => void;
}

export default function ImportIssueModal({
    isOpen,
    onClose,
    projectId,
    onSuccess,
}: ImportIssueModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [result, setResult] = useState<{ created: number; failed: number; errors: string[] } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setResult(null);
        }
    };

    const handleImport = async () => {
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/projects/${projectId}/issues/import`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem('access_token')}`,
                    },
                    body: formData,
                }
            );

            if (!response.ok) {
                throw new Error('Import failed');
            }

            const data = await response.json();
            setResult(data);
            if (data.created > 0) {
                onSuccess();
            }
        } catch (error) {
            console.error('Import error:', error);
            setResult({ created: 0, failed: 0, errors: ['Failed to upload file'] });
        } finally {
            setIsUploading(false);
        }
    };

    const reset = () => {
        setFile(null);
        setResult(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <Dialog open={isOpen} onClose={onClose} className="relative z-50">
            <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
            <div className="fixed inset-0 flex items-center justify-center p-4">
                <Dialog.Panel className="mx-auto max-w-lg w-full rounded-xl bg-white dark:bg-neutral-800 p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-6">
                        <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                            Import Issues from CSV
                        </Dialog.Title>
                        <button
                            onClick={onClose}
                            className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                        >
                            <XMarkIcon className="h-5 w-5" />
                        </button>
                    </div>

                    {!result ? (
                        <div className="space-y-6">
                            <div
                                className={`border-2 border-dashed rounded-lg p-8 text-center ${file
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-neutral-300 dark:border-neutral-600 hover:border-neutral-400'
                                    }`}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                        setFile(e.dataTransfer.files[0]);
                                    }
                                }}
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    accept=".csv"
                                    className="hidden"
                                />

                                {file ? (
                                    <div className="flex flex-col items-center">
                                        <DocumentTextIcon className="h-12 w-12 text-blue-500 mb-2" />
                                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                                            {file.name}
                                        </p>
                                        <p className="text-xs text-neutral-500 mt-1">
                                            {(file.size / 1024).toFixed(1)} KB
                                        </p>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                reset();
                                            }}
                                            className="mt-4 text-xs text-red-500 hover:text-red-600 font-medium"
                                        >
                                            Remove file
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                        <ArrowUpTrayIcon className="h-12 w-12 text-neutral-400 mb-2" />
                                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                                            Click to upload or drag and drop
                                        </p>
                                        <p className="text-xs text-neutral-500 mt-1">
                                            CSV files only
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3">
                                <Button variant="secondary" onClick={onClose}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={handleImport}
                                    disabled={!file || isUploading}
                                    className="min-w-[100px]"
                                >
                                    {isUploading ? <Spinner className="h-4 w-4" /> : 'Import'}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-4">
                                <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-4">
                                    Import Summary
                                </h3>
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-md">
                                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                                            {result.created}
                                        </div>
                                        <div className="text-xs text-green-700 dark:text-green-300">
                                            Issues Created
                                        </div>
                                    </div>
                                    <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-md">
                                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                                            {result.failed}
                                        </div>
                                        <div className="text-xs text-red-700 dark:text-red-300">
                                            Failed Rows
                                        </div>
                                    </div>
                                </div>

                                {result.errors.length > 0 && (
                                    <div className="mt-4">
                                        <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-2">
                                            Errors:
                                        </p>
                                        <div className="max-h-32 overflow-y-auto text-xs text-red-500 space-y-1">
                                            {result.errors.map((err, i) => (
                                                <div key={i}>{err}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3">
                                <Button variant="primary" onClick={onClose}>
                                    Done
                                </Button>
                            </div>
                        </div>
                    )}
                </Dialog.Panel>
            </div>
        </Dialog>
    );
}
