import React from 'react';
import Image from 'next/image';
import Button from '../Button';
import Spinner from '../Spinner';
import { useSprintAttachments, SprintAttachment } from '../../hooks/useSprints';

interface SprintAttachmentsTabProps {
    projectId: string;
    sprintId: string;
}

/**
 * Sprint Attachments Tab Component
 * 
 * Handles file upload (drag & drop + click), display, and deletion
 * for sprint-level attachments.
 * 
 * Extracted from SprintDetailModal for better maintainability.
 */
export function SprintAttachmentsTab({ projectId, sprintId }: SprintAttachmentsTabProps) {
    const {
        attachments,
        isLoading,
        isError,
        error,
        uploadAttachment,
        isUploading,
        uploadError,
        deleteAttachment,
        isDeleting,
        deleteError,
    } = useSprintAttachments(projectId, sprintId);

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [dragActive, setDragActive] = React.useState(false);
    const [recentlyUploadedId, setRecentlyUploadedId] = React.useState<string | null>(null);

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            const uploaded = await uploadAttachment(file);
            setRecentlyUploadedId(uploaded.id);
            setTimeout(() => setRecentlyUploadedId(null), 1200);
        }
    }

    async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            const uploaded = await uploadAttachment(file);
            setRecentlyUploadedId(uploaded.id);
            setTimeout(() => setRecentlyUploadedId(null), 1200);
        }
    }

    async function handleDeleteAttachment(a: SprintAttachment) {
        await deleteAttachment(a.id);
    }

    function renderFileIconOrThumb(a: SprintAttachment) {
        const ext = a.filename?.split('.').pop()?.toLowerCase();
        const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];

        if (imageExtensions.includes(ext || "")) {
            if (!a.filepath) {
                return <span className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded text-xl">📎</span>;
            }

            try {
                const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
                const imageUrl = a.filepath.startsWith('http')
                    ? a.filepath
                    : `${baseUrl}${a.filepath.startsWith('/') ? '' : '/'}${a.filepath}`;

                return <Image src={imageUrl} alt={a.filename || 'Image'} className="w-10 h-10 object-cover rounded" width={40} height={40} />;
            } catch {
                return <span className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded text-xl">📎</span>;
            }
        }
        return <span className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded text-xl">📎</span>;
    }

    function getAttachmentUrl(filepath: string | undefined): string {
        if (!filepath) return '#';
        try {
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
            return filepath.startsWith('http')
                ? filepath
                : `${baseUrl}${filepath.startsWith('/') ? '' : '/'}${filepath}`;
        } catch {
            return '#';
        }
    }

    return (
        <div className="flex flex-col h-[400px]">
            {/* Upload Zone */}
            <div
                className={`border-2 border-dashed rounded-md p-4 mb-4 text-center transition-colors ${dragActive ? 'border-accent-blue bg-accent-blue/5' : 'border-gray-300 dark:border-gray-700'
                    }`}
                onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={e => { e.preventDefault(); setDragActive(false); }}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{ cursor: 'pointer' }}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isUploading}
                />
                <span className="text-accent-blue font-semibold">Click or drag a file to upload</span>
                {isUploading && <Spinner className="inline ml-2 h-4 w-4" />}
                {uploadError && <div className="text-red-500 text-sm mt-1">{String(uploadError)}</div>}
            </div>

            {/* Attachments List */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {isLoading ? (
                    <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>
                ) : isError ? (
                    <div className="text-red-500 text-center py-8">{error?.message || 'Failed to load attachments.'}</div>
                ) : attachments && attachments.length > 0 ? (
                    attachments.map((a) => (
                        <div
                            key={a.id}
                            className={`flex items-center gap-3 border rounded-md p-2 bg-white dark:bg-background-dark transition-all duration-300 ${recentlyUploadedId === a.id ? 'animate-fade-in-slide ring-2 ring-accent-blue/60 bg-accent-blue/5' : ''
                                }`}
                        >
                            {renderFileIconOrThumb(a)}
                            <div className="flex-1">
                                <a
                                    href={getAttachmentUrl(a.filepath)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-accent-blue font-medium hover:underline"
                                    onClick={(e) => !a.filepath && e.preventDefault()}
                                >
                                    {a.filename || 'Unknown file'}
                                </a>
                                <div className="text-xs text-gray-500">
                                    Uploaded by {a.uploader?.name || a.uploader?.email || 'Unknown user'} on {new Date(a.createdAt).toLocaleString()}
                                </div>
                            </div>
                            <Button
                                size="xs"
                                variant="secondary"
                                onClick={() => handleDeleteAttachment(a)}
                                loading={isDeleting}
                                disabled={isDeleting}
                            >
                                Delete
                            </Button>
                        </div>
                    ))
                ) : (
                    <div className="text-gray-400 text-center py-8">No attachments yet.</div>
                )}
                {deleteError && <div className="text-red-500 text-sm mt-1">{String(deleteError)}</div>}
            </div>
        </div>
    );
}

export default SprintAttachmentsTab;
