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
import { ISSUE_TYPES, ISSUE_PRIORITIES, ISSUE_STATUSES } from '@/constants/issueOptions';
import type { Issue } from '@/hooks/useProjectIssues';

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
  const { labels, components } = useTaxonomy(projectId);

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

  useEffect(() => {
    if (isEdit && issue) {
      setValue('title', issue.title);
      setValue('description', issue.description || '');
      setValue('priority', issue.priority);
      setValue('status', issue.status as typeof ISSUE_STATUSES[number]);
      setValue('type', issue.type);
      setValue('assigneeId', typeof issue.assignee === 'object' ? issue.assignee.id : (issue.assignee || ''));
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
          assigneeId: data.assigneeId === '' ? null : data.assigneeId,
        };
        
        console.log('Updating issue with payload:', payload);
        await updateIssue.mutateAsync({ issueId: issue.id, data: payload });
        showToast('Issue updated successfully!', 'success');
      } else {
        const payload = {
          ...data,
          assigneeId: data.assigneeId === '' ? null : data.assigneeId,
          projectId,
        };
        await createIssue.mutateAsync(payload);
        showToast('Issue created successfully!', 'success');
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

  return (
    <Modal open={isOpen} onClose={handleClose} title={isEdit ? 'Edit Issue' : 'Create New Issue'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Type
            </label>
            <select
              {...register('type')}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-accent-blue focus:border-accent-blue bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {ISSUE_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Priority
            </label>
            <select
              {...register('priority')}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-accent-blue focus:border-accent-blue bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {ISSUE_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Assignee
            </label>
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