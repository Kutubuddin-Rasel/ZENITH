"use client";
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { useCreateIssue } from '@/hooks/useCreateIssue';
import { useUpdateIssue } from '@/hooks/useProjectIssues';
import { useToast } from '@/context/ToastContext';
import { useProjectMembers } from '@/hooks/useProjectMembers';
import { useTaxonomy } from '@/hooks/useTaxonomy';
import { useSmartDefaults } from '@/hooks/useSmartDefaults';
import { ISSUE_TYPES, ISSUE_PRIORITIES, ISSUE_STATUSES } from '@/constants/issueOptions';
import type { Issue } from '@/hooks/useProjectIssues';
import { LightBulbIcon } from '@heroicons/react/24/outline';

const createIssueSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  priority: z.enum(ISSUE_PRIORITIES),
  status: z.enum(ISSUE_STATUSES),
  type: z.enum(ISSUE_TYPES),
  assigneeId: z.string().optional(),
});

type CreateIssueFormData = z.infer<typeof createIssueSchema>;

interface CreateIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  issue?: Issue;
  mode?: 'create' | 'edit';
}

export default function CreateIssueModal({ isOpen, onClose, projectId, issue, mode = 'create' }: CreateIssueModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();
  const createIssue = useCreateIssue();
  const updateIssue = useUpdateIssue(projectId);
  const { data: members = [] } = useProjectMembers(projectId);
  const { } = useTaxonomy(projectId);

  // Smart Defaults Integration
  const { getIssueDefaults, trackAction, suggestions } = useSmartDefaults();

  const isEdit = mode === 'edit' && !!issue;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CreateIssueFormData>({
    resolver: zodResolver(createIssueSchema),
    defaultValues: {
      priority: 'Medium',
      status: 'To Do',
      type: 'Task',
    },
  });

  // Load smart defaults when modal opens (only for create mode)
  useEffect(() => {
    if (isOpen && !isEdit && projectId) {
      const teamMemberIds = members.map(m => m.userId);
      getIssueDefaults(projectId, {
        projectType: 'software_development',
        teamMembers: teamMemberIds,
      });
    }
  }, [isOpen, isEdit, projectId, members, getIssueDefaults]);

  // Apply high-confidence suggestions
  useEffect(() => {
    if (!isEdit && (suggestions || []).length > 0) {
      (suggestions || []).forEach(suggestion => {
        if (suggestion.confidence > 0.7) {
          if (suggestion.field === 'priority' && ISSUE_PRIORITIES.includes(suggestion.value as typeof ISSUE_PRIORITIES[number])) {
            setValue('priority', suggestion.value as typeof ISSUE_PRIORITIES[number]);
          } else if (suggestion.field === 'type' && ISSUE_TYPES.includes(suggestion.value as typeof ISSUE_TYPES[number])) {
            setValue('type', suggestion.value as typeof ISSUE_TYPES[number]);
          } else if (suggestion.field === 'assignee' && typeof suggestion.value === 'string') {
            setValue('assigneeId', suggestion.value);
          }
        }
      });
    }
  }, [suggestions, isEdit, setValue]);

  useEffect(() => {
    if (isEdit && issue) {
      setValue('title', issue.title);
      setValue('description', issue.description || '');
      setValue('priority', issue.priority);
      setValue('status', issue.status as typeof ISSUE_STATUSES[number]);
      setValue('type', issue.type);
      setValue('assigneeId', typeof issue.assignee === 'object' && issue.assignee ? issue.assignee.id : (issue.assignee || undefined));
    } else {
      // Reset form for create mode
      reset({
        title: '',
        description: '',
        priority: 'Medium',
        status: 'To Do',
        type: 'Task',
        assigneeId: '',
      });
    }
  }, [isEdit, issue, setValue, reset]);

  const onSubmit = async (data: CreateIssueFormData) => {
    setIsSubmitting(true);
    try {
      if (isEdit && issue) {
        // For edit, only send fields that the backend supports
        const payload = {
          title: data.title,
          description: data.description,
          priority: data.priority,
          status: data.status,
          type: data.type,
          assigneeId: data.assigneeId === '' ? undefined : data.assigneeId,
        };


        await updateIssue.mutateAsync({ issueId: issue.id, data: payload });
        showToast('Issue updated successfully!', 'success');

        // Track behavior for learning
        trackAction('issue_assigned', {
          assignee: data.assigneeId,
          issueType: data.type,
        });
      } else {
        const payload = {
          ...data,
          projectId,
          assigneeId: data.assigneeId === '' ? undefined : data.assigneeId,
        };
        await createIssue.mutateAsync(payload);
        showToast('Issue created successfully!', 'success');

        // Track issue creation for learning
        trackAction('issue_created', {
          type: data.type,
          priority: data.priority,
          assignee: data.assigneeId,
        });
      }
      reset();
      onClose();
    } catch (error) {
      console.error('Error submitting issue:', error);
      showToast(isEdit ? 'Failed to update issue' : 'Failed to create issue', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Get suggestion for a specific field
  const getSuggestion = (field: string) => {
    const safeSuggestions = Array.isArray(suggestions) ? suggestions : [];
    return safeSuggestions.find((s) => s.field === field);
  };

  return (
    <Modal open={isOpen} onClose={handleClose} title={isEdit ? 'Edit Issue' : 'Create New Issue'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Smart Suggestions Banner */}
        {!isEdit && (suggestions || []).length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <LightBulbIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Smart Suggestions Applied
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                  Based on your preferences and team patterns
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Title *
          </label>
          <Input
            {...register('title')}
            placeholder="Enter issue title"
            error={errors.title?.message}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Description
          </label>
          <textarea
            {...register('description')}
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-accent-blue focus:border-accent-blue bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none"
            placeholder="Describe the issue..."
          />
        </div>

        {/* Type and Priority */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Type
              </label>
              {getSuggestion('type') && (
                <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <LightBulbIcon className="h-3 w-3" />
                  {Math.round((getSuggestion('type')?.confidence || 0) * 100)}%
                </span>
              )}
            </div>
            <select
              {...register('type')}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-accent-blue focus:border-accent-blue bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {ISSUE_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            {getSuggestion('type')?.reason && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {getSuggestion('type')?.reason}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Priority
              </label>
              {getSuggestion('priority') && (
                <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <LightBulbIcon className="h-3 w-3" />
                  {Math.round((getSuggestion('priority')?.confidence || 0) * 100)}%
                </span>
              )}
            </div>
            <select
              {...register('priority')}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-accent-blue focus:border-accent-blue bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {ISSUE_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
            {getSuggestion('priority')?.reason && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {getSuggestion('priority')?.reason}
              </p>
            )}
          </div>
        </div>

        {/* Status and Assignee */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Status
            </label>
            <select
              {...register('status')}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-accent-blue focus:border-accent-blue bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {ISSUE_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Assignee
              </label>
              {getSuggestion('assignee') && (
                <span className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <LightBulbIcon className="h-3 w-3" />
                  {Math.round((getSuggestion('assignee')?.confidence || 0) * 100)}%
                </span>
              )}
            </div>
            <select
              {...register('assigneeId')}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-accent-blue focus:border-accent-blue bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">Unassigned</option>
              {members?.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.user?.name || member.userId}
                </option>
              ))}
            </select>
            {getSuggestion('assignee')?.reason && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {getSuggestion('assignee')?.reason}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="min-w-[100px]"
          >
            {isSubmitting ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create Issue')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}