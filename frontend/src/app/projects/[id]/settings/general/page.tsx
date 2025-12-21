"use client";
import React, { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useProject, useUpdateProject } from '@/hooks/useProject';
import { useToast } from '@/context/ToastContext';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Spinner from '@/components/Spinner';
import FormError from '@/components/FormError';
import ProtectedProjectRoute from '@/components/ProtectedProjectRoute';

type FormData = {
  name: string;
  description: string;
};

export default function GeneralSettingsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { project, isLoading: isProjectLoading } = useProject(projectId);
  const { mutate: updateProject, isPending: isUpdating, error } = useUpdateProject(projectId);
  const { showToast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>();

  useEffect(() => {
    if (project) {
      reset({
        name: project.name,
        description: project.description || '',
      });
    }
  }, [project, reset]);

  const onSubmit = (data: FormData) => {
    updateProject(data, {
      onSuccess: () => {
        showToast('Project updated successfully.', 'success');
      },
      onError: () => {
        showToast('Failed to update project.', 'error');
      },
    });
  };

  if (isProjectLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Spinner />
      </div>
    );
  }

  return (
    <ProtectedProjectRoute allowedRoles={["Super-Admin", "ProjectLead"]}>
      <Card>
        <h2 className="text-xl font-bold p-6 border-b border-neutral-200 dark:border-neutral-800">
          General Settings
        </h2>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="p-6 space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Project Name
              </label>
              <Input
                id="name"
                {...register('name', { required: 'Project name is required' })}
              />
              {errors.name && <FormError error={errors.name.message} />}
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Description
              </label>
              <textarea
                id="description"
                rows={4}
                className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm dark:text-white border-neutral-200 dark:border-neutral-700 transition-all duration-300 placeholder-neutral-400 dark:placeholder-neutral-500 hover:border-neutral-300 dark:hover:border-neutral-600 focus:border-blue-500 dark:focus:border-blue-400 shadow-sm hover:shadow-md focus:shadow-lg"
                {...register('description')}
              />
            </div>
          </div>
          <div className="bg-neutral-50 dark:bg-neutral-800 px-6 py-4 flex justify-end items-center gap-4">
            {error && <FormError error={(error as Error).message} />}
            <Button type="submit" loading={isUpdating} disabled={!isDirty || isUpdating}>
              Save Changes
            </Button>
          </div>
        </form>
      </Card>
    </ProtectedProjectRoute>
  );
} 