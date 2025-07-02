"use client";
import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import FormError from './FormError';

interface FormData {
  name: string;
}

interface TaxonomyFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: FormData) => void;
  title: string;
  initialData?: { name: string };
  isSubmitting?: boolean;
  error?: Error | null;
}

export default function TaxonomyFormModal({
  open,
  onClose,
  onSubmit,
  title,
  initialData,
  isSubmitting,
  error,
}: TaxonomyFormModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    defaultValues: initialData || { name: '' },
  });

  useEffect(() => {
    if (open) {
      reset(initialData || { name: '' });
    }
  }, [open, initialData, reset]);

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="p-6">
          <h3 className="text-lg font-bold mb-4">{title}</h3>
          <div>
            <label htmlFor="name" className="block text-sm font-medium">Name</label>
            <Input
              id="name"
              {...register('name', { required: 'Name is required.' })}
              className="mt-1"
            />
            {errors.name && <FormError error={errors.name.message} />}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 px-6 py-4 flex justify-end items-center gap-3">
          {error && <FormError error={error.message} />}
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting} disabled={!isDirty || isSubmitting}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
