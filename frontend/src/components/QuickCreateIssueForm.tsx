"use client";
import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCreateIssue } from '../hooks/useCreateIssue';
import Button from './Button';
import Input from './Input';
import Typography from './Typography';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { ISSUE_PRIORITIES, ISSUE_TYPES } from '../constants/issueOptions';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  priority: z.enum(ISSUE_PRIORITIES),
  type: z.enum(ISSUE_TYPES),
  estimatedHours: z.coerce.number().min(0, 'Must be 0 or more'),
});

type FormData = z.infer<typeof schema>;

interface QuickCreateIssueFormProps {
  projectId: string;
  status: string;
  onClose: () => void;
  onIssueCreated: () => void;
}

const QuickCreateIssueForm: React.FC<QuickCreateIssueFormProps> = ({
  projectId,
  status,
  onClose,
  onIssueCreated,
}) => {
  const createIssue = useCreateIssue();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      priority: 'Medium',
      type: 'Task',
      estimatedHours: 0,
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await createIssue.mutateAsync({
        title: data.title,
        status,
        priority: data.priority,
        type: data.type,
        projectId,
        estimatedHours: data.estimatedHours,
      });
      reset();
      onIssueCreated();
    } catch (error) {
      console.error('Failed to create issue', error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-3">
      <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 space-y-4">
        <div>
          <Typography variant="label" className="text-neutral-700 dark:text-neutral-300 mb-2">
            Title
          </Typography>
        <Input
          {...register('title')}
          placeholder="What needs to be done?"
          autoFocus
          error={errors.title?.message}
        />
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Typography variant="label" className="text-neutral-700 dark:text-neutral-300 mb-2">
              Priority
            </Typography>
            <select
              {...register('priority')}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
            >
              {ISSUE_PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {errors.priority && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.priority.message}</p>}
          </div>
          <div>
            <Typography variant="label" className="text-neutral-700 dark:text-neutral-300 mb-2">
              Type
            </Typography>
            <select
              {...register('type')}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
            >
              {ISSUE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {errors.type && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.type.message}</p>}
          </div>
        </div>
        
        <div>
          <Typography variant="label" className="text-neutral-700 dark:text-neutral-300 mb-2">
            Estimated Hours
          </Typography>
          <Input
            {...register('estimatedHours', { valueAsNumber: true })}
            type="number"
            min={0}
            step={0.5}
            placeholder="e.g. 2.5"
            error={errors.estimatedHours?.message}
          />
        </div>
      </div>
      
      <div className="flex items-center gap-2 mt-3">
        <Button 
          type="submit" 
          variant="primary"
          size="sm" 
          loading={createIssue.isPending}
        >
          Add Issue
        </Button>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
        >
          <XMarkIcon className="h-5 w-5 text-neutral-500" />
        </button>
      </div>
    </form>
  );
};

export default QuickCreateIssueForm; 