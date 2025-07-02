import React, { useState, useMemo } from 'react';
import Modal from './Modal';
import Button from './Button';
import Spinner from './Spinner';
import { Release } from '../hooks/useReleases';
import { useReleaseIssues, useAssignIssueToRelease, useUnassignIssueFromRelease } from '../hooks/useReleaseIssues';
import { useProjectIssues, Issue, Label } from '../hooks/useProjectIssues';
import { useReleaseAttachments } from '../hooks/useReleaseIssues';
import { useAuth } from '../context/AuthContext';
import Image from 'next/image';
import { CheckCircleIcon, XCircleIcon, TrashIcon, UserCircleIcon } from '@heroicons/react/24/solid';
import { differenceInDays, format } from 'date-fns';
import Downshift from 'downshift';

interface ReleaseDetailModalProps {
  open: boolean;
  onClose: () => void;
  release: Release;
  projectId: string;
}

const statusColors = {
  'To Do': 'bg-gray-200 text-gray-800',
  'In Progress': 'bg-blue-200 text-blue-800',
  'Done': 'bg-green-200 text-green-800',
  'Ready for QA': 'bg-yellow-200 text-yellow-800',
};

const ReleaseDetailModal = ({ open, onClose, release, projectId }: ReleaseDetailModalProps) => {
  const { issues: releaseIssues, isLoading: loadingRelease, isError: errorRelease } = useReleaseIssues(projectId, release.id);
  const { issues: allProjectIssues, isLoading: loadingAllIssues } = useProjectIssues(projectId);
  
  const assignIssue = useAssignIssueToRelease(projectId, release.id);
  const unassignIssue = useUnassignIssueFromRelease(projectId, release.id);
  const [activeTab, setActiveTab] = useState<'issues' | 'attachments'>('issues');

  const stats = useMemo(() => {
    if (!releaseIssues) return { total: 0, done: 0, percent: 0, byStatus: {} };
    const total = releaseIssues.length;
    const done = releaseIssues.filter(i => i.status === 'Done').length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    const byStatus = releaseIssues.reduce((acc, issue) => {
      acc[issue.status] = (acc[issue.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return { total, done, percent, byStatus };
  }, [releaseIssues]);

  const daysRemaining = release.releaseDate ? differenceInDays(new Date(release.releaseDate), new Date()) : null;

  const issuesNotInRelease = useMemo(() => {
    if (!allProjectIssues || !releaseIssues) return [];
    const releaseIssueIds = new Set(releaseIssues.map(i => i.id));
    return allProjectIssues.filter(i => !releaseIssueIds.has(i.id));
  }, [allProjectIssues, releaseIssues]);

  const handleAssignIssue = async (issueId: string) => {
    await assignIssue.mutateAsync(issueId);
  }

  return (
    <Modal open={open} onClose={onClose} title="" maxWidthClass="max-w-4xl">
      {/* Header */}
      <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-t-lg">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{release.name}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{release.description}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-xs px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 capitalize font-medium">{release.status}</span>
          {release.releaseDate && (
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <span className="font-semibold">Release Date:</span>
              <span>{format(new Date(release.releaseDate), 'MMMM d, yyyy')}</span>
            </div>
          )}
          {daysRemaining !== null && (
            <div className={`px-2 py-1 rounded-md text-xs font-bold ${daysRemaining < 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {daysRemaining < 0 ? `${Math.abs(daysRemaining)} days overdue` : `${daysRemaining} days remaining`}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <div className="relative">
            <svg className="w-20 h-20 transform -rotate-90">
              <circle cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="8" className="text-gray-200 dark:text-gray-700" fill="transparent" />
              <circle
                cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="8"
                className="text-green-500" fill="transparent"
                strokeDasharray={2 * Math.PI * 34}
                strokeDashoffset={(2 * Math.PI * 34) * (1 - (stats.percent / 100))}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-gray-800 dark:text-gray-200">{stats.percent}%</span>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{stats.done} / {stats.total}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Issues Completed</div>
          </div>
        </div>
        <div className="col-span-2">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Issue Status Breakdown</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byStatus).map(([status, count]) => (
                <span key={status} className={`px-2.5 py-1 text-xs font-semibold rounded-full ${statusColors[status as keyof typeof statusColors] || 'bg-gray-200'}`}>
                  {status}: {count}
                </span>
              ))}
            </div>
        </div>
      </div>
      
      <div className="p-6">
        <div className="mb-4 border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex gap-6">
            <button
              className={`py-2 px-1 font-semibold text-sm transition-colors ${activeTab === 'issues' ? 'text-accent-blue border-b-2 border-accent-blue' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              onClick={() => setActiveTab('issues')}
            >Issues</button>
            <button
              className={`py-2 px-1 font-semibold text-sm transition-colors ${activeTab === 'attachments' ? 'text-accent-blue border-b-2 border-accent-blue' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              onClick={() => setActiveTab('attachments')}
            >Attachments</button>
          </nav>
        </div>
        {activeTab === 'issues' && (
          <div className="space-y-6">
            <div>
              <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-200">Add issue to release</h4>
               <Downshift
                onChange={selection => {
                  if (selection) {
                    handleAssignIssue(selection.id);
                  }
                }}
                itemToString={item => (item ? item.title : '')}
              >
                {({
                  getInputProps,
                  getItemProps,
                  getMenuProps,
                  isOpen,
                  inputValue,
                  highlightedIndex,
                  selectedItem,
                  getRootProps,
                }) => (
                  <div className="relative">
                    <div {...getRootProps({}, { suppressRefError: true })}>
                      <input
                        {...getInputProps()}
                        placeholder="Search to add issues..."
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-accent-blue focus:outline-none"
                      />
                    </div>
                    <ul
                      {...getMenuProps()}
                      className={`absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm ${
                        !isOpen && 'hidden'
                      }`}
                    >
                      {loadingAllIssues ? (
                        <li className="px-4 py-2 text-gray-500">Loading...</li>
                      ) : (
                        issuesNotInRelease
                        .filter(item => !inputValue || item.title.toLowerCase().includes(inputValue.toLowerCase()))
                        .map((item, index) => (
                          <li
                            key={item.id}
                            {...getItemProps({
                              index,
                              item,
                              style: {
                                backgroundColor:
                                  highlightedIndex === index ? '#e0f2fe' : 'transparent',
                                fontWeight: selectedItem === item ? 'bold' : 'normal',
                              },
                              className: "px-4 py-2 cursor-pointer"
                            })}
                          >
                            {item.title}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}
              </Downshift>
            </div>

            <div>
              <h4 className="font-semibold mb-2 text-gray-800 dark:text-gray-200">Issues in this release ({stats.total})</h4>
              {loadingRelease ? (
                <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>
              ) : errorRelease ? (
                <div className="text-red-500 text-center py-8">Failed to load release issues.</div>
              ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700 min-h-[80px] border border-gray-200 dark:border-gray-700 rounded-md">
                  {releaseIssues && releaseIssues.length === 0 && <li className="p-4 text-gray-500 text-center">No issues assigned to this release.</li>}
                  {releaseIssues && releaseIssues.map((issue: Issue) => (
                    <li key={issue.id} className="flex items-center gap-4 px-4 py-3 group">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 dark:text-gray-200 truncate">{issue.title}</div>
                        <div className="flex gap-2 mt-1 text-xs items-center">
                          <span className={`${statusColors[issue.status as keyof typeof statusColors] || 'bg-gray-200'} px-2 py-0.5 rounded font-semibold`}>{issue.status}</span>
                          {typeof issue.assignee === 'object' && issue.assignee !== null ? (
                              <Image src={issue.assignee.avatarUrl || '/default-avatar.png'} alt={issue.assignee.name} width={16} height={16} className="rounded-full" />
                          ) : (
                              <UserCircleIcon className="w-4 h-4 text-gray-400" />
                          )}
                          <span className="font-semibold">{typeof issue.assignee === 'object' && issue.assignee !== null ? issue.assignee.name : 'Unassigned'}</span>
                        </div>
                      </div>
                      <Button size="xs" variant="secondary" onClick={() => unassignIssue.mutate(issue.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <TrashIcon className="h-4 w-4 mr-1"/> Unassign
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {activeTab === 'attachments' && (
          <ReleaseAttachmentsTab projectId={projectId} releaseId={release.id} />
        )}
      </div>
    </Modal>
  );
};

function ReleaseAttachmentsTab({ projectId, releaseId }: { projectId: string; releaseId: string }) {
  const { user } = useAuth();
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
    refetch,
  } = useReleaseAttachments(projectId, releaseId);
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

  async function handleDeleteAttachment(a: any) {
    await deleteAttachment(a.id);
  }

  function renderFileIconOrThumb(a: any) {
    const ext = a.filename.split('.').pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext || "")) {
      return <Image src={a.filepath} alt={a.filename} className="w-10 h-10 object-cover rounded" width={40} height={40} />;
    }
    return <span className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded text-xl">📎</span>;
  }

  return (
    <div className="flex flex-col h-[400px]">
      <div
        className={`border-2 border-dashed rounded-md p-4 mb-4 text-center transition-colors ${dragActive ? 'border-accent-blue bg-accent-blue/5' : 'border-gray-300 dark:border-gray-700'}`}
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
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>
        ) : isError ? (
          <div className="text-red-500 text-center py-8">{error?.message || 'Failed to load attachments.'}</div>
        ) : attachments && attachments.length > 0 ? (
          attachments.map((a) => (
            <div
              key={a.id}
              className={`flex items-center gap-3 border rounded-md p-2 bg-white dark:bg-background-dark transition-all duration-300 ${recentlyUploadedId === a.id ? 'animate-fade-in-slide ring-2 ring-accent-blue/60 bg-accent-blue/5' : ''}`}
            >
              {renderFileIconOrThumb(a)}
              <div className="flex-1">
                <a href={a.filepath} target="_blank" rel="noopener noreferrer" className="text-accent-blue font-medium hover:underline">{a.filename}</a>
                <div className="text-xs text-gray-500">Uploaded by {a.uploader.name || a.uploader.email} on {new Date(a.createdAt).toLocaleString()}</div>
              </div>
              <Button size="xs" variant="secondary" onClick={() => handleDeleteAttachment(a)} loading={isDeleting} disabled={isDeleting}>Delete</Button>
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

export default ReleaseDetailModal; 