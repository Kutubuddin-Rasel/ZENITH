"use client";
import React, { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Spinner from '@/components/Spinner';
import Button from '@/components/Button';
import { 
  PaperClipIcon, 
  DocumentIcon, 
  PhotoIcon, 
  FilmIcon, 
  MusicalNoteIcon, 
  ArchiveBoxIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  PlusIcon,
  CloudArrowUpIcon,
  DocumentTextIcon,
  TableCellsIcon,
  CodeBracketIcon,
  EyeIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { useToast } from '@/context/ToastContext';
import { useProjectRole } from '@/context/RoleContext';
import { 
  useProjectAttachments, 
  useUploadProjectAttachment, 
  useDeleteProjectAttachment, 
  useDownloadProjectAttachment,
  ProjectAttachment 
} from '@/hooks/useProjectAttachments';

// File type icons mapping
const getFileIcon = (filename: string) => {
  const extension = filename.split('.').pop()?.toLowerCase();
  
  switch (extension) {
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg':
    case 'webp':
      return <PhotoIcon className="h-8 w-8 text-blue-500" />;
    case 'mp4':
    case 'avi':
    case 'mov':
    case 'wmv':
      return <FilmIcon className="h-8 w-8 text-purple-500" />;
    case 'mp3':
    case 'wav':
    case 'flac':
      return <MusicalNoteIcon className="h-8 w-8 text-green-500" />;
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return <ArchiveBoxIcon className="h-8 w-8 text-orange-500" />;
    case 'pdf':
      return <DocumentTextIcon className="h-8 w-8 text-red-500" />;
    case 'xlsx':
    case 'xls':
    case 'csv':
      return <TableCellsIcon className="h-8 w-8 text-green-600" />;
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'html':
    case 'css':
    case 'json':
    case 'xml':
      return <CodeBracketIcon className="h-8 w-8 text-gray-600" />;
    default:
      return <DocumentIcon className="h-8 w-8 text-gray-500" />;
  }
};

const isPreviewable = (filename: string) => {
  const extension = filename.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'pdf'].includes(extension || '');
};

export default function AttachmentsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const projectRole = useProjectRole(projectId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [previewFile, setPreviewFile] = useState<ProjectAttachment | null>(null);

  // Real API hooks
  const { data: attachments = [], isLoading } = useProjectAttachments(projectId);
  const uploadAttachment = useUploadProjectAttachment(projectId);
  const deleteAttachment = useDeleteProjectAttachment(projectId);
  const downloadAttachment = useDownloadProjectAttachment(projectId);

  // Check if user can upload files
  const canUpload = ['Super-Admin', 'ProjectLead', 'Developer', 'QA'].includes(projectRole || '');

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    try {
      // Upload files one by one
      for (const file of selectedFiles) {
        await uploadAttachment.mutateAsync(file);
      }
      
      setSelectedFiles([]);
      showToast('Files uploaded successfully!', 'success');
    } catch (error) {
      showToast('Failed to upload files', 'error');
    }
  };

  const handleDelete = async (attachmentId: string) => {
    try {
      await deleteAttachment.mutateAsync(attachmentId);
      showToast('File deleted successfully', 'success');
    } catch (error) {
      showToast('Failed to delete file', 'error');
    }
  };

  const handleDownload = async (attachment: ProjectAttachment) => {
    try {
      await downloadAttachment.mutateAsync(attachment);
      showToast(`Downloading ${attachment.originalName || attachment.filename}...`, 'info');
    } catch (error) {
      showToast('Failed to download file', 'error');
    }
  };

  const handlePreview = (attachment: ProjectAttachment) => {
    setPreviewFile(attachment);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      {/* Header */}
      <div className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                Attachments
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                Manage project files and documents
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* View Mode Toggle */}
              <div className="flex bg-neutral-100 dark:bg-neutral-700 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                  }`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'list'
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
                  }`}
                >
                  List
                </button>
              </div>

              {/* Upload Button */}
              {canUpload && (
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="primary"
                  className="flex items-center gap-2"
                >
                  <CloudArrowUpIcon className="h-4 w-4" />
                  Upload Files
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Upload Progress */}
      {uploadAttachment.isPending && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mx-4 mt-4">
          <div className="flex items-center gap-3 mb-3">
            <Spinner className="h-5 w-5 text-blue-500" />
            <div>
              <h3 className="font-medium text-blue-900 dark:text-blue-100">Uploading Files...</h3>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Please wait while your files are being uploaded
              </p>
            </div>
          </div>
          <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 overflow-hidden">
            <div className="h-2 bg-blue-500 rounded-full animate-pulse" />
          </div>
        </div>
      )}

      {/* Selected Files Preview */}
      {selectedFiles.length > 0 && (
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 mx-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-green-900 dark:text-green-100">
              Selected Files ({selectedFiles.length})
            </h3>
            <Button
              onClick={handleUpload}
              disabled={uploadAttachment.isPending}
              variant="primary"
              size="sm"
              className="flex items-center gap-2"
            >
              {uploadAttachment.isPending ? <Spinner className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
              {uploadAttachment.isPending ? 'Uploading...' : 'Upload All'}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {selectedFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-white dark:bg-neutral-800 rounded-lg border border-green-200 dark:border-green-700">
                {getFileIcon(file.name)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {formatFileSize(file.size)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attachments List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {attachments.length === 0 ? (
          <div className="text-center py-16">
            <PaperClipIcon className="h-16 w-16 text-neutral-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-2">
              No attachments yet
            </h3>
            <p className="text-neutral-500 dark:text-neutral-400 mb-6">
              Upload files to share with your team
            </p>
            {canUpload && (
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="primary"
                className="flex items-center gap-2 mx-auto"
              >
                <CloudArrowUpIcon className="h-4 w-4" />
                Upload Your First File
              </Button>
            )}
          </div>
        ) : (
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' : 'space-y-4'}>
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className={`group bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 hover:shadow-md transition-all duration-200 ${
                  viewMode === 'list' ? 'flex items-center gap-4' : ''
                }`}
              >
                {viewMode === 'grid' ? (
                  // Grid View
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="p-3 bg-neutral-100 dark:bg-neutral-700 rounded-lg">
                        {getFileIcon(attachment.originalName || attachment.filename)}
                      </div>
                      <div className="flex items-center gap-1">
                        {isPreviewable(attachment.originalName || attachment.filename) && (
                          <button
                            onClick={() => handlePreview(attachment)}
                            className="p-2 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors duration-200"
                            title="Preview"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDownload(attachment)}
                          disabled={downloadAttachment.isPending}
                          className="p-2 bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-lg transition-colors duration-200 disabled:opacity-50"
                          title="Download"
                        >
                          {downloadAttachment.isPending ? <Spinner className="h-4 w-4" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
                        </button>
                        {canUpload && (
                          <button
                            onClick={() => handleDelete(attachment.id)}
                            disabled={deleteAttachment.isPending}
                            className="p-2 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg transition-colors duration-200 disabled:opacity-50"
                            title="Delete"
                          >
                            {deleteAttachment.isPending ? <Spinner className="h-4 w-4" /> : <TrashIcon className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <h3 className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                        {attachment.originalName || attachment.filename}
                      </h3>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {attachment.fileSize ? formatFileSize(attachment.fileSize) : 'Unknown size'}
                      </p>
                      <div className="flex items-center justify-between text-xs text-neutral-400 dark:text-neutral-500">
                        <span>By {attachment.uploader?.name || 'Unknown'}</span>
                        <span>{new Date(attachment.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  // List View
                  <div className="flex items-center gap-4 w-full">
                    <div className="p-3 bg-neutral-100 dark:bg-neutral-700 rounded-lg">
                      {getFileIcon(attachment.originalName || attachment.filename)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                        {attachment.originalName || attachment.filename}
                      </h3>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        {attachment.fileSize ? formatFileSize(attachment.fileSize) : 'Unknown size'} • Uploaded by {attachment.uploader?.name || 'Unknown'} on {new Date(attachment.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {isPreviewable(attachment.originalName || attachment.filename) && (
                        <button
                          onClick={() => handlePreview(attachment)}
                          className="p-2 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors duration-200"
                          title="Preview"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDownload(attachment)}
                        disabled={downloadAttachment.isPending}
                        className="p-2 bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-lg transition-colors duration-200 disabled:opacity-50"
                        title="Download"
                      >
                        {downloadAttachment.isPending ? <Spinner className="h-4 w-4" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
                      </button>
                      {canUpload && (
                        <button
                          onClick={() => handleDelete(attachment.id)}
                          disabled={deleteAttachment.isPending}
                          className="p-2 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg transition-colors duration-200 disabled:opacity-50"
                          title="Delete"
                        >
                          {deleteAttachment.isPending ? <Spinner className="h-4 w-4" /> : <TrashIcon className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-lg max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
              <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
                {previewFile.originalName || previewFile.filename}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(previewFile)}
                  className="p-2 bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-lg transition-colors"
                  title="Download"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-2 bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-600 rounded-lg transition-colors"
                  title="Close"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-4 max-h-[calc(90vh-120px)] overflow-auto">
              {previewFile.originalName?.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={`${process.env.NEXT_PUBLIC_API_URL}/projects/${projectId}/attachments/${previewFile.id}/download`}
                  className="w-full h-96 border-0"
                  title="PDF Preview"
                />
              ) : (
                <img
                  src={`${process.env.NEXT_PUBLIC_API_URL}/projects/${projectId}/attachments/${previewFile.id}/download`}
                  alt={previewFile.originalName || previewFile.filename}
                  className="max-w-full h-auto"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        accept="*/*"
      />
    </div>
  );
} 