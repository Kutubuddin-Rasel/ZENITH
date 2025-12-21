"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Spinner from "@/components/Spinner";
import Button from "@/components/Button";
import Input from '@/components/Input';
import Card from '@/components/Card';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useProjectIssues, useIssueHistory } from '@/hooks/useProjectIssues';
import { useIssueComments, IssueComment } from '@/hooks/useProjectIssues';
import { useAuth } from '@/context/AuthContext';
import { getSocket } from '@/lib/socket';
import { useUpdateComment, useDeleteComment } from '@/hooks/useProjectIssues';
import { useProject } from '@/hooks/useProject';
import { useIssueAttachments, IssueAttachment } from '@/hooks/useProjectIssues';
import { useCommentAttachments, CommentAttachment } from '@/hooks/useProjectIssues';
import { useProjectMembers } from '@/hooks/useProject';
import { saveAs } from 'file-saver';
import { useCreateIssue } from '@/hooks/useCreateIssue';
import RoleBadge from '@/components/RoleBadge';
import { UserCircleIcon, FlagIcon, CalendarDaysIcon, LinkIcon, TagIcon } from '@heroicons/react/24/outline';
import LinkedIssues from '@/components/Issue/LinkedIssues';
import LabelPicker from '@/components/Issue/LabelPicker';
import { apiFetch } from '@/lib/fetcher';
import { useMutation, useQueryClient } from '@tanstack/react-query';


const commentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty'),
});

type CommentFormData = z.infer<typeof commentSchema>;

export default function IssueDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const issueId = params.iid as string;
  const { issues, isLoading, isError } = useProjectIssues(projectId);
  const issue = issues?.find((i) => i.id === issueId);
  const [activeTab, setActiveTab] = useState('comments');
  const createIssue = useCreateIssue();
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [subtaskType, setSubtaskType] = useState('Task');
  const [submittingSubtask, setSubmittingSubtask] = useState(false);
  const [subtaskError, setSubtaskError] = useState<string | null>(null);
  const { data: members } = useProjectMembers(projectId);

  // Mutation to update labels
  const queryClient = useQueryClient();
  const updateLabels = useMutation({
    mutationFn: async (newLabels: string[]) => {
      return apiFetch(`/projects/${projectId}/issues/${issueId}/labels`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels: newLabels }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues', projectId] });
    }
  });

  async function handleCreateSubtask(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingSubtask(true);
    setSubtaskError(null);
    try {
      await createIssue.mutateAsync({
        title: subtaskTitle,
        type: subtaskType,
        projectId,
        priority: 'Medium',
        status: 'To Do',
        estimatedHours: 0,
      });
      setSubtaskTitle('');
      setSubtaskType('Task');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create sub-task';
      setSubtaskError(errorMessage);
    } finally {
      setSubmittingSubtask(false);
    }
  }

  // Helper to get assignee role
  function getAssigneeRole() {
    if (!members || !issue) return undefined;
    const assigneeId: string = typeof issue.assignee === 'object' ? (issue.assignee?.id ?? '') : (issue.assignee ?? '');
    return members.find(m => m.userId === assigneeId)?.roleName;
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>;
  if (isError || !issue) return <div className="text-red-500">Issue not found.</div>;

  return (
    <div className="flex flex-col md:flex-row gap-8 animate-fade-in">
      {/* Left column: Issue summary and metadata */}
      <div className="flex-1 min-w-0">
        <Card className="mb-4 bg-white/80 dark:bg-neutral-800/70 backdrop-blur-lg border border-accent-blue/10 shadow-2xl p-0">
          {/* Glassy header with type, key, status, priority */}
          <div className="flex flex-col md:flex-row md:items-center gap-4 px-8 py-6 bg-gradient-to-r from-white via-blue-50/30 to-white dark:from-neutral-900 dark:via-blue-900/10 dark:to-neutral-900 border-b border-neutral-200/60 dark:border-neutral-800">
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <TypeBadge type={issue.type} />
                <span className="font-mono text-xs text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded shadow-sm border border-neutral-200 dark:border-neutral-700">{issue.key}</span>
                <StatusBadge status={issue.status} />
                <PriorityBadge priority={issue.priority} />
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-accent-blue dark:text-accent-blue-light mt-2 mb-1 break-words">{issue.title}</h1>
            </div>
            <div className="flex flex-col items-end gap-2 min-w-[160px]">
              <div className="flex items-center gap-2">
                <Avatar user={typeof issue.assignee === 'object' ? {
                  name: issue.assignee?.name,
                  email: issue.assignee?.email,
                  avatarUrl: issue.assignee?.avatarUrl
                } : undefined} size={10} />
                <span className="text-xs text-neutral-700 dark:text-neutral-200 font-medium">{typeof issue.assignee === 'object' && issue.assignee ? issue.assignee.name : 'Unassigned'}</span>
              </div>
              {getAssigneeRole() && <RoleBadge role={getAssigneeRole() || ''} />}
              <div className="flex items-center gap-2 text-xs text-neutral-400 mt-1">
                <CalendarDaysIcon className="h-4 w-4 mr-1" />
                <span>Updated {issue.updatedAt ? new Date(issue.updatedAt).toLocaleDateString() : '-'}</span>
              </div>
            </div>
          </div>
          {/* Description */}
          <div className="prose dark:prose-invert px-8 py-6 min-h-[60px] text-lg border-b border-accent-blue/5 bg-gradient-to-br from-white/60 to-blue-50/40 dark:from-background-dark/80 dark:to-neutral-900/60">
            {issue?.description || <span className="text-neutral-400">No description yet.</span>}
          </div>
          {/* Metadata chips */}
          <div className="flex flex-wrap gap-4 px-8 py-4 border-b border-accent-blue/5 bg-gradient-to-r from-white/60 to-blue-50/40 dark:from-background-dark/80 dark:to-neutral-900/60 items-center">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold text-neutral-600 dark:text-neutral-300"><UserCircleIcon className="h-4 w-4 mr-1" />Reporter: {'Unknown'}</span>
            {issue.storyPoints !== undefined && <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold"><FlagIcon className="h-4 w-4 mr-1" />{String(issue.storyPoints || '')} pts</span>}
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold text-neutral-600 dark:text-neutral-300"><CalendarDaysIcon className="h-4 w-4 mr-1" />Created: {issue.createdAt ? new Date(issue.createdAt).toLocaleDateString() : '-'}</span>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold text-neutral-600 dark:text-neutral-300"><CalendarDaysIcon className="h-4 w-4 mr-1" />Updated: {issue.updatedAt ? new Date(issue.updatedAt).toLocaleDateString() : '-'}</span>
            <div className="flex items-center gap-2 ml-auto">
              <TagIcon className="h-4 w-4 text-neutral-400" />
              <LabelPicker
                labels={issue.labels || []}
                onChange={(newLabels) => updateLabels.mutate(newLabels)}
              />
            </div>
          </div>
          {/* Linked Issues Section (NEW) */}
          <div className="px-8 py-4 border-b border-accent-blue/5 bg-white/40 dark:bg-neutral-800/40">
            <h3 className="font-semibold text-sm mb-3 text-neutral-600 dark:text-neutral-300 flex items-center gap-2">
              <LinkIcon className="h-4 w-4" /> Linked Issues
            </h3>
            <LinkedIssues projectId={projectId} issueId={issueId} />
          </div>
          {/* Sub-tasks section */}
          <div className="px-8 py-6">
            <h3 className="font-semibold text-lg mb-2 text-accent-blue">Sub-tasks</h3>
            {issue?.children && issue.children.length > 0 ? (
              <ul className="space-y-2">
                {issue.children.map((sub) => (
                  <li key={sub.id} className="flex items-center gap-2 bg-gradient-to-r from-blue-50/60 to-purple-50/60 dark:from-neutral-900/80 dark:to-purple-900/80 px-4 py-2 rounded-xl shadow-sm">
                    <TypeBadge type={sub.type} />
                    <a href={`/projects/${projectId}/issues/${sub.id}`} className="text-accent-blue hover:underline font-medium">{sub.title}</a>
                    <StatusBadge status={sub.status} />
                    <PriorityBadge priority={sub.priority} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-neutral-400 mb-2">No sub-tasks yet.</div>
            )}
            <form onSubmit={handleCreateSubtask} className="flex gap-2 mt-3">
              <Input
                value={subtaskTitle}
                onChange={e => setSubtaskTitle(e.target.value)}
                placeholder="Add a sub-task..."
                className="flex-1"
                required
              />
              <select
                value={subtaskType}
                onChange={e => setSubtaskType(e.target.value)}
                className="border rounded px-2 py-1 text-xs bg-white dark:bg-neutral-800 border-accent-blue/30 focus:ring-2 focus:ring-accent-blue text-neutral-900 dark:text-neutral-100 shadow-sm"
              >
                <option value="Task">Task</option>
                <option value="Bug">Bug</option>
                <option value="Story">Story</option>
                <option value="Sub-task">Sub-task</option>
              </select>
              <Button type="submit" size="sm" loading={submittingSubtask} disabled={submittingSubtask}>Add</Button>
            </form>
            {subtaskError && <div className="text-red-500 text-xs mt-1">{subtaskError}</div>}
          </div>
          {/* Show parent if this is a sub-task */}
          {issue?.parent && (
            <div className="px-8 pb-4 text-sm text-neutral-500">
              Parent: <a href={`/projects/${projectId}/issues/${issue.parent.id}`} className="text-accent-blue hover:underline">{issue.parent.title}</a>
            </div>
          )}
        </Card>
      </div>
      {/* Right column: Tabs for Comments, Attachments, History, Work Log */}
      <div className="flex-1 min-w-0 max-w-xl">
        <Card className="bg-white/80 dark:bg-neutral-800/70 backdrop-blur-lg border border-accent-blue/10 shadow-xl p-0 overflow-hidden">
          {/* Tabs */}
          <div className="sticky top-0 z-10 bg-gradient-to-r from-white/80 to-blue-50/60 dark:from-background-dark/80 dark:to-blue-900/40 backdrop-blur border-b border-accent-blue/10 px-6 pt-4">
            <div className="flex gap-6 overflow-x-auto pb-0">
              {['comments', 'attachments', 'history', 'worklog'].map(tab => (
                <button
                  key={tab}
                  className={`px-4 py-2 font-semibold text-sm whitespace-nowrap rounded-t-xl transition-all duration-200 border-b-2 focus:outline-none focus:ring-2 focus:ring-accent-blue/30 ${activeTab === tab ? 'text-accent-blue border-accent-blue bg-accent-blue/10 dark:bg-accent-blue/20' : 'text-neutral-400 border-transparent hover:text-accent-blue/80 hover:bg-accent-blue/5'}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {/* Tab content */}
          <div className="px-6 py-6 min-h-[320px]">
            {activeTab === 'comments' && (
              <CommentsTab projectId={projectId} issueId={issueId} />
            )}
            {activeTab === 'attachments' && (
              <AttachmentsTab projectId={projectId} issueId={issueId} />
            )}
            {activeTab === 'history' && (
              <HistoryTab projectId={projectId} issueId={issueId} />
            )}
            {activeTab === 'worklog' && (
              <WorkLogTab />
            )}
            {activeTab !== 'comments' && (
              <div className="text-neutral-400 text-center py-8">Select a tab to view details.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function CommentsTab({ projectId, issueId }: { projectId: string; issueId: string }) {
  const { user } = useAuth();
  const { currentUserRole } = useProject(projectId);
  const {
    comments,
    isLoading: commentsLoading,
    isError: commentsIsError,
    error: commentsError,
    addComment,
    isAdding: commentLoading,
    addError: commentError,
    refetch,
  } = useIssueComments(projectId, issueId);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const [optimisticComments, setOptimisticComments] = useState<IssueComment[] | null>(null);
  const updateComment = useUpdateComment(projectId, issueId);
  const deleteComment = useDeleteComment(projectId, issueId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recentlyEditedId, setRecentlyEditedId] = useState<string | null>(null);
  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null);

  // Scroll to bottom on new comment
  useEffect(() => {
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [comments, optimisticComments]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (notification: { message: string; context?: { issueId?: string } }) => {
      if (notification?.context?.issueId === issueId) {
        refetch();
      }
    };
    socket.on('notification', handler);
    return () => {
      socket.off('notification', handler);
    };
  }, [issueId, refetch]);

  const commentForm = useForm<CommentFormData>({
    resolver: zodResolver(commentSchema),
    defaultValues: { content: '' },
  });

  async function handleAddComment(data: CommentFormData) {
    if (!user) return;
    // Optimistically add comment
    const newComment: IssueComment = {
      id: 'optimistic-' + Math.random().toString(36).slice(2),
      author: { id: user.id, name: user.name || '', email: user.email || '' },
      content: data.content,
      createdAt: new Date().toISOString(),
    };
    setOptimisticComments((prev) => (prev ? [...prev, newComment] : [newComment]));
    commentForm.reset();
    try {
      await addComment(data.content);
      setOptimisticComments(null);
    } catch {
      // Optionally show error toast
      setOptimisticComments((prev) => prev?.filter((c) => c.id !== newComment.id) || null);
    }
  }

  const canEditOrDelete = (c: IssueComment) => user && (c.author.id === user.id || currentUserRole === 'ProjectLead');

  const allComments = comments && optimisticComments ? [...comments, ...optimisticComments] : comments || optimisticComments;

  // Animation: track last comment id
  const lastCommentId = allComments && allComments.length > 0 ? allComments[allComments.length - 1].id : null;

  return (
    <div className="flex flex-col h-[400px]">
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {commentsLoading ? (
          <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>
        ) : commentsIsError ? (
          <div className="text-red-500 text-center py-8">{commentsError?.message || 'Failed to load comments.'}</div>
        ) : allComments && allComments.length > 0 ? (
          allComments.map((c, idx) => {
            const isNew = c.id === lastCommentId && idx === allComments.length - 1;
            const isEdited = c.id === recentlyEditedId;
            return (
              <div
                key={c.id}
                className={`flex items-start gap-3 opacity-100 group transition-all duration-300 ${isNew ? 'animate-fade-in-slide' : ''} ${isEdited ? 'ring-2 ring-accent-blue/60 bg-accent-blue/5' : ''}`}
                onAnimationEnd={() => isNew && setRecentlyEditedId(null)}
              >
                <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center font-bold text-accent-blue">
                  {c.author.avatarUrl ? <Image src={c.author.avatarUrl} alt={c.author.name || c.author.email || ''} className="w-8 h-8 rounded-full" width={32} height={32} /> : (c.author.name?.[0] || c.author.email[0])}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{c.author.name || c.author.email}</span>
                    <span className="text-xs text-neutral-400">{new Date(c.createdAt).toLocaleString()}</span>
                    {canEditOrDelete(c) && (
                      <span className="ml-2 flex gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                        <Button size="xs" variant="secondary" onClick={() => setEditingId(c.id)} disabled={editingId === c.id}>
                          Edit
                        </Button>
                        <Button size="xs" variant="secondary" onClick={() => deleteComment.mutate(c.id)} disabled={deleteComment.status === 'pending'}>
                          Delete
                        </Button>
                      </span>
                    )}
                    <Button size="xs" variant="secondary" onClick={() => setExpandedCommentId(expandedCommentId === c.id ? null : c.id)}>
                      {expandedCommentId === c.id ? 'Hide Attachments' : 'Show Attachments'}
                    </Button>
                  </div>
                  {editingId === c.id ? (
                    <EditCommentForm
                      initialContent={c.content}
                      onSave={async (content) => {
                        await updateComment.mutateAsync({ commentId: c.id, content });
                        setEditingId(null);
                        setRecentlyEditedId(c.id);
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <div className="mt-1 text-neutral-800 dark:text-neutral-200 whitespace-pre-line">{c.content}</div>
                  )}
                  {expandedCommentId === c.id && (
                    <CommentAttachmentsSection projectId={projectId} issueId={issueId} commentId={c.id} />
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-neutral-400 text-center py-8">No comments yet.</div>
        )}
        <div ref={commentsEndRef} />
      </div>
      <form onSubmit={commentForm.handleSubmit(handleAddComment)} className="mt-4 flex gap-2 items-end">
        <textarea
          className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-accent-blue bg-white dark:bg-background-dark dark:text-text-dark border-neutral-300 dark:border-neutral-700 min-h-[40px]"
          placeholder="Add a comment..."
          {...commentForm.register('content')}
          disabled={commentLoading}
        />
        <Button type="submit" size="sm" loading={commentLoading} disabled={commentLoading}>Send</Button>
      </form>
      {commentForm.formState.errors.content && (
        <div className="text-red-500 text-sm mt-1">{commentForm.formState.errors.content.message}</div>
      )}
      {commentError && <div className="text-red-500 text-sm mt-1">{String(commentError)}</div>}
    </div>
  );
}

function CommentAttachmentsSection({ projectId, issueId, commentId }: { projectId: string; issueId: string; commentId: string }) {
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
  } = useCommentAttachments(projectId, issueId, commentId);
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

  async function handleDeleteAttachment(a: CommentAttachment) {
    await deleteAttachment(a.id);
  }

  function renderFileIconOrThumb(a: CommentAttachment | IssueAttachment) {
    const ext = a.filename.split('.').pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext || "")) {
      return <Image src={a.filepath} alt={a.filename} className="w-8 h-8 object-cover rounded" width={32} height={32} />;
    }
    return <span className="w-8 h-8 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 rounded text-xl">📎</span>;
  }

  return (
    <div className="mt-2 border rounded-md p-2 bg-neutral-50 dark:bg-background-dark">
      <div
        className={`border-2 border-dashed rounded-md p-2 mb-2 text-center transition-colors ${dragActive ? 'border-accent-blue bg-accent-blue/5' : 'border-neutral-300 dark:border-neutral-700'}`}
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
      <div className="space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-4"><Spinner className="h-4 w-4" /></div>
        ) : isError ? (
          <div className="text-red-500 text-center py-4">{error?.message || 'Failed to load attachments.'}</div>
        ) : attachments && attachments.length > 0 ? (
          attachments.map((a) => (
            <div
              key={a.id}
              className={`flex items-center gap-2 border rounded-md p-1 bg-white dark:bg-background-dark transition-all duration-300 ${recentlyUploadedId === a.id ? 'animate-fade-in-slide ring-2 ring-accent-blue/60 bg-accent-blue/5' : ''}`}
            >
              {renderFileIconOrThumb(a)}
              <div className="flex-1">
                <a href={a.filepath} target="_blank" rel="noopener noreferrer" className="text-accent-blue font-medium hover:underline text-sm">{a.filename}</a>
                <div className="text-xs text-neutral-500">Uploaded by {a.uploader.name || a.uploader.email} on {new Date(a.createdAt).toLocaleString()}</div>
              </div>
              <Button size="xs" variant="secondary" onClick={() => handleDeleteAttachment(a)} loading={isDeleting} disabled={isDeleting}>Delete</Button>
            </div>
          ))
        ) : (
          <div className="text-neutral-400 text-center py-2">No attachments yet.</div>
        )}
        {deleteError && <div className="text-red-500 text-sm mt-1">{String(deleteError)}</div>}
      </div>
    </div>
  );
}

function AttachmentsTab({ projectId, issueId }: { projectId: string; issueId: string }) {
  const { user } = useAuth();
  const { currentUserRole } = useProject(projectId);
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
  } = useIssueAttachments(projectId, issueId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [recentlyUploadedId, setRecentlyUploadedId] = useState<string | null>(null);

  const canDelete = (a: IssueAttachment) => user && (a.uploader.id === user.id || currentUserRole === 'ProjectLead');

  // Real-time updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (notification: { message: string; context?: { issueId?: string } }) => {
      if (notification?.context?.issueId === issueId) {
        refetch();
      }
    };
    socket.on('notification', handler);
    return () => { socket.off('notification', handler); };
  }, [issueId, refetch]);

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

  async function handleDeleteAttachment(a: IssueAttachment) {
    await deleteAttachment(a.id);
  }

  function renderFileIconOrThumb(a: IssueAttachment | CommentAttachment) {
    const ext = a.filename.split('.').pop()?.toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext || '')) {
      return <Image src={a.filepath} alt={a.filename} className="w-10 h-10 object-cover rounded" width={40} height={40} />;
    }
    // fallback icon
    return <span className="w-10 h-10 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 rounded text-xl">📎</span>;
  }

  return (
    <div className="flex flex-col h-[400px]">
      <div
        className={`border-2 border-dashed rounded-md p-4 mb-4 text-center transition-colors ${dragActive ? 'border-accent-blue bg-accent-blue/5' : 'border-neutral-300 dark:border-neutral-700'}`}
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
                <div className="text-xs text-neutral-500">Uploaded by {a.uploader.name || a.uploader.email} on {new Date(a.createdAt).toLocaleString()}</div>
              </div>
              {canDelete(a) && (
                <Button size="xs" variant="secondary" onClick={() => handleDeleteAttachment(a)} loading={isDeleting} disabled={isDeleting}>Delete</Button>
              )}
            </div>
          ))
        ) : (
          <div className="text-neutral-400 text-center py-8">No attachments yet.</div>
        )}
        {deleteError && <div className="text-red-500 text-sm mt-1">{String(deleteError)}</div>}
      </div>
    </div>
  );
}


function exportToJSON(data: unknown[], filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  saveAs(blob, filename);
}

function useCopyToClipboard(timeout = 1500) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const copy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), timeout);
  };
  return { copiedIdx, copy };
}

function HistoryTab({ projectId, issueId }: { projectId: string; issueId: string }) {
  const { data, isLoading, isError, error } = useIssueHistory(issueId);
  const { data: members } = useProjectMembers(projectId);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [userFilter, setUserFilter] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const { copiedIdx, copy } = useCopyToClipboard();

  function getActionIcon(action: string) {
    if (action === 'CREATE') return <span title="Created" className="bg-green-100 text-green-600 rounded-full p-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg></span>;
    if (action === 'UPDATE') return <span title="Edited" className="bg-yellow-100 text-yellow-700 rounded-full p-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536M9 11l6 6M3 21h18" /></svg></span>;
    if (action === 'DELETE') return <span title="Deleted" className="bg-red-100 text-red-600 rounded-full p-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg></span>;
    return null;
  }

  function getUserInfo(userId: string | undefined) {
    if (!members) return null;
    return members.find((m) => m.userId === (userId || ''))?.user || null;
  }

  function renderUserAvatar(userId: string) {
    const user = getUserInfo(userId);
    const label = user?.name || user?.email || userId;
    if (user?.avatarUrl) {
      return (
        <span className="group relative">
          <Image src={user.avatarUrl} alt={user.name || user.email || ''} className="w-8 h-8 rounded-full object-cover border-2 border-accent-blue shadow mr-2" width={32} height={32} />
          <span className="absolute left-10 top-1/2 -translate-y-1/2 bg-neutral-900 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition pointer-events-none z-10 whitespace-nowrap">{label}</span>
        </span>
      );
    }
    return (
      <span className="group relative w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center font-bold text-accent-blue text-sm mr-2">
        {label[0]}
        <span className="absolute left-10 top-1/2 -translate-y-1/2 bg-neutral-900 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition pointer-events-none z-10 whitespace-nowrap">{label}</span>
      </span>
    );
  }

  const fieldLabels: Record<string, string> = React.useMemo(() => ({
    title: 'Title',
    status: 'Status',
    assignee: 'Assignee',
    priority: 'Priority',
    description: 'Description',
    storyPoints: 'Story Points',
    // Add more as needed
  }), []);

  // Filtering and search logic
  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.filter((rev) => {
      if (userFilter && rev.changedBy !== userFilter) return false;
      if (actionFilter && rev.action !== actionFilter) return false;
      if (search) {
        const snapshot = rev.snapshot || {};
        const match = Object.entries(snapshot).some(([k, v]) =>
          (fieldLabels[k] || k).toLowerCase().includes(search.toLowerCase()) ||
          String(v).toLowerCase().includes(search.toLowerCase())
        );
        if (!match) return false;
      }
      return true;
    });
  }, [data, userFilter, actionFilter, search, fieldLabels]);

  function renderDiff(prev: Record<string, unknown> = {}, curr: Record<string, unknown> = {}, idx: number): React.ReactNode | null {
    if (!prev || typeof prev !== 'object' || Array.isArray(prev) || !curr || typeof curr !== 'object' || Array.isArray(curr)) return null;
    const changed: string[] = [];
    for (const key in curr) {
      if (Object.prototype.hasOwnProperty.call(curr, key) && curr[key] !== prev[key]) changed.push(key);
    }
    if (changed.length === 0) return null;
    const isCollapsed = expandedIdx !== idx && changed.length > 3;

    function renderAssignee(userId: string | undefined): React.ReactNode {
      if (!userId || typeof userId !== 'string') return <span className="italic text-neutral-400">Unassigned</span>;
      const user = getUserInfo(userId);
      if (!user) return <span className="italic text-neutral-400">Unknown</span>;
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-blue/10 text-accent-blue text-xs font-semibold">
          {user.avatarUrl ? (
            <Image src={user.avatarUrl} alt={user.name || user.email || ''} className="w-4 h-4 rounded-full object-cover" width={16} height={16} />
          ) : (
            <span className="w-4 h-4 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-bold">{(user.name || user.email || '?')[0]}</span>
          )}
          {user.name || user.email || 'Unknown'}
        </span>
      );
    }

    function renderChips(arr: unknown[] | undefined, type: 'label' | 'component'): React.ReactNode {
      if (!arr || !Array.isArray(arr)) return null;
      return (
        <span className="flex flex-wrap gap-1">
          {arr.map((item: unknown) => (
            <span key={typeof item === 'object' && item !== null && 'id' in item ? String(item.id) : String(item)} className={`px-2 py-0.5 rounded text-xs font-semibold ${type === 'label' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{typeof item === 'object' && item !== null && 'name' in item ? String(item.name) : String(item)}</span>
          ))}
        </span>
      );
    }

    return (
      <ul className="ml-4 text-xs text-neutral-500 mt-2">
        {(isCollapsed ? changed.slice(0, 3) : changed).map((k, i): React.ReactNode => {
          const prevVal = prev[k] as string | undefined;
          const currVal = curr[k] as string | undefined;
          const summary = `${fieldLabels[k] || k}: ${k === 'assignee' ? (getUserInfo(prevVal || '')?.name || prevVal || 'Unassigned') : String(prevVal || '')} → ${k === 'assignee' ? (getUserInfo(currVal || '')?.name || currVal || 'Unassigned') : String(currVal || '')}`;
          return (
            <li key={k} className="flex gap-2 items-center mb-1 group">
              <span className="font-semibold">{fieldLabels[k] || k}:</span>
              {/* Special rendering for assignee, labels, components */}
              {k === 'assignee' ? (
                <>
                  {renderAssignee(prevVal)}
                  <span className="mx-1">→</span>
                  {renderAssignee(currVal)}
                </>
              ) : k === 'labels' ? (
                <>
                  {renderChips(prev[k] as unknown[], 'label')}
                  <span className="mx-1">→</span>
                  {renderChips(curr[k] as unknown[], 'label')}
                </>
              ) : k === 'components' ? (
                <>
                  {renderChips(prev[k] as unknown[], 'component')}
                  <span className="mx-1">→</span>
                  {renderChips(curr[k] as unknown[], 'component')}
                </>
              ) : (
                <>
                  <span className="px-1 rounded bg-red-100 dark:bg-red-900/40 line-through text-red-600 max-w-[120px] truncate" title={String(prevVal || '')}>{String(prevVal || '')}</span>
                  <span className="mx-1">→</span>
                  <span className="px-1 rounded bg-green-100 dark:bg-green-900/40 text-green-700 max-w-[120px] truncate" title={String(currVal || '')}>{String(currVal || '')}</span>
                </>
              )}
              <button
                className="ml-2 px-1 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-xs text-neutral-700 dark:text-neutral-200 hover:bg-accent-blue/20 focus:outline-none"
                onClick={() => copy(summary, i)}
                title="Copy change summary"
              >
                {copiedIdx === i ? 'Copied!' : 'Copy'}
              </button>
            </li>
          );
        })}
        {changed.length > 3 && (
          <li>
            <button
              className="text-accent-blue underline text-xs mt-1 focus:outline-none"
              onClick={() => setExpandedIdx(isCollapsed ? idx : null)}
            >
              {isCollapsed ? `Show ${changed.length - 3} more…` : 'Show less'}
            </button>
          </li>
        )}
      </ul>
    );
  }

  // --- UI ---
  return (
    <div className="flex flex-col h-[400px] overflow-y-auto pr-2">
      {/* Filters and Export */}
      <div className="flex flex-wrap gap-4 mb-6 items-center bg-gradient-to-r from-white/80 to-blue-50/60 dark:from-background-dark/80 dark:to-blue-900/40 px-4 py-3 rounded-xl shadow-sm border border-accent-blue/10">
        <select
          className="border rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800 border-accent-blue/20 focus:ring-2 focus:ring-accent-blue text-neutral-900 dark:text-neutral-100 shadow-sm"
          value={userFilter}
          onChange={e => setUserFilter(e.target.value)}
        >
          <option value="">All users</option>
          {members && members.map(m => (
            <option key={m.userId} value={m.userId}>{m.user?.name || m.user?.email || m.userId}</option>
          ))}
        </select>
        <select
          className="border rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800 border-accent-blue/20 focus:ring-2 focus:ring-accent-blue text-neutral-900 dark:text-neutral-100 shadow-sm"
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
        >
          <option value="">All actions</option>
          <option value="CREATE">Created</option>
          <option value="UPDATE">Edited</option>
          <option value="DELETE">Deleted</option>
        </select>
        <input
          className="border rounded px-3 py-2 text-sm bg-white dark:bg-neutral-800 border-accent-blue/20 focus:ring-2 focus:ring-accent-blue text-neutral-900 dark:text-neutral-100 shadow-sm"
          placeholder="Search history..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button
          className="ml-auto px-4 py-2 rounded-lg bg-gradient-to-r from-accent-blue to-blue-500 text-white font-semibold shadow hover:from-blue-500 hover:to-accent-blue-dark transition"
          onClick={() => exportToJSON(filteredData, `issue-${issueId}-history.json`)}
          disabled={!filteredData.length}
        >
          Export JSON
        </button>
      </div>
      {/* Timeline */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>
      ) : isError ? (
        <div className="text-red-500 text-center py-8">{error?.message || 'Failed to load history.'}</div>
      ) : filteredData && filteredData.length > 0 ? (
        <ol className="relative border-l-4 border-accent-blue/20 ml-6 space-y-8">
          {filteredData.map((rev, idx) => {
            let diff: React.ReactNode | null = null;
            if (rev.action === 'UPDATE' && rev.snapshot && rev.snapshot.prev && rev.snapshot.curr) {
              diff = renderDiff(
                rev.snapshot.prev as Record<string, unknown>,
                rev.snapshot.curr as Record<string, unknown>,
                idx
              );
            }
            return (
              <li
                key={rev.id}
                className={`mb-8 ml-4 animate-fade-in-slide group transition-all duration-200`}
              >
                <div className="absolute -left-7 top-2 w-10 h-10 flex items-center justify-center z-10">
                  {getActionIcon(rev.action)}
                </div>
                <div className="bg-white/90 dark:bg-neutral-900/80 rounded-xl shadow-lg border border-accent-blue/10 px-6 py-4 flex flex-col gap-2">
                  <div className="flex items-center gap-3 mb-1">
                    {renderUserAvatar(rev.changedBy)}
                    <span className="font-semibold text-accent-blue text-sm">{getUserInfo(rev.changedBy)?.name || getUserInfo(rev.changedBy)?.email || rev.changedBy}</span>
                    <span className="text-xs text-neutral-400">{new Date(rev.createdAt).toLocaleString()}</span>
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${rev.action === 'CREATE' ? 'bg-green-100 text-green-700' : rev.action === 'UPDATE' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{rev.action.charAt(0) + rev.action.slice(1).toLowerCase()}</span>
                  </div>
                  {diff}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="text-neutral-400 text-center py-8">No history found.</div>
      )}
    </div>
  );
}

// TypeBadge: Local definition
function TypeBadge({ type }: { type: string }) {
  const color =
    type === 'Bug' ? 'bg-red-100 text-red-800' :
      type === 'Story' ? 'bg-green-100 text-green-800' :
        type === 'Task' ? 'bg-blue-100 text-blue-800' :
          type === 'Epic' ? 'bg-purple-100 text-purple-800' :
            type === 'Sub-task' ? 'bg-neutral-100 text-neutral-800' :
              'bg-neutral-100 text-neutral-800';
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold shadow-sm ${color} gap-1`}>{type}</span>
  );
}

// StatusBadge: Local definition
function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'Done' ? 'bg-green-100 text-green-800' :
      status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
        status === 'To Do' ? 'bg-neutral-200 text-neutral-800' :
          status === 'Blocked' ? 'bg-red-100 text-red-800' :
            status === 'Ready for QA' ? 'bg-yellow-100 text-yellow-800' :
              'bg-neutral-100 text-neutral-800';
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold shadow-sm ${color}`}>{status}</span>
  );
}

// PriorityBadge: Local definition
function PriorityBadge({ priority }: { priority: string }) {
  const color =
    priority === 'Highest' ? 'bg-red-700 text-white' :
      priority === 'High' ? 'bg-red-100 text-red-800' :
        priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
          priority === 'Low' ? 'bg-green-100 text-green-800' :
            priority === 'Lowest' ? 'bg-neutral-200 text-neutral-700' :
              'bg-neutral-100 text-neutral-800';
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold shadow-sm ${color} gap-1`}>{priority}</span>
  );
}

// Avatar: Local definition
function Avatar({ user, size = 10 }: { user?: { name?: string; email?: string; avatarUrl?: string }, size?: number }) {
  if (!user) return <div className={`w-${size} h-${size} rounded-full bg-neutral-200 flex items-center justify-center`}><UserCircleIcon className={`h-${size - 2} w-${size - 2} text-neutral-400`} /></div>;
  if (user.avatarUrl) return <Image src={user.avatarUrl} alt={user.name || user.email || ''} className={`w-${size} h-${size} rounded-full object-cover`} width={size <= 16 ? 16 : size <= 32 ? 32 : 48} height={size <= 16 ? 16 : size <= 32 ? 32 : 48} />;
  return <div className={`w-${size} h-${size} rounded-full bg-neutral-200 flex items-center justify-center font-bold`}>{(user.name || user.email || '')[0]}</div>;
}

// WorkLogTab: Local stub (if not imported)
function WorkLogTab() {
  return <div>Work Log Tab Placeholder</div>;
}

// EditCommentForm: Local stub (if not imported)
function EditCommentForm({ initialContent, onSave, onCancel }: {
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
}) {
  return <form><textarea defaultValue={initialContent} /><button type="button" onClick={() => onSave('')}>Save</button><button type="button" onClick={onCancel}>Cancel</button></form>;
} 