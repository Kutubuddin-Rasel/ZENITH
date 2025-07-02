"use client";
import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Spinner from '@/components/Spinner';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/context/ToastContext';
import {
  useLabels,
  useCreateLabel,
  useUpdateLabel,
  useDeleteLabel,
  Label,
} from '@/hooks/useTaxonomy';
import TaxonomyFormModal from '@/components/TaxonomyFormModal';
import ConfirmationModal from '@/components/ConfirmationModal';

export default function LabelsSettingsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { showToast } = useToast();

  const [isFormModalOpen, setFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<Label | null>(null);

  const { data: labels, isLoading } = useLabels(projectId);
  const { mutate: createLabel, isPending: isCreating } = useCreateLabel(projectId);
  const { mutate: updateLabel, isPending: isUpdating } = useUpdateLabel(projectId);
  const { mutate: deleteLabel, isPending: isDeleting } = useDeleteLabel(projectId);

  const handleOpenFormModal = (label: Label | null = null) => {
    setSelectedLabel(label);
    setFormModalOpen(true);
  };

  const handleOpenDeleteModal = (label: Label) => {
    setSelectedLabel(label);
    setDeleteModalOpen(true);
  };

  const handleFormSubmit = (data: { name: string }) => {
    if (selectedLabel) {
      updateLabel({ id: selectedLabel.id, name: data.name }, {
        onSuccess: () => {
          showToast('Label updated.', 'success');
          setFormModalOpen(false);
        },
        onError: (err) => showToast(`Error: ${(err as Error).message}`, 'error'),
      });
    } else {
      createLabel({ name: data.name }, {
        onSuccess: () => {
          showToast('Label created.', 'success');
          setFormModalOpen(false);
        },
        onError: (err) => showToast(`Error: ${(err as Error).message}`, 'error'),
      });
    }
  };

  const handleDeleteConfirm = () => {
    if (selectedLabel) {
      deleteLabel(selectedLabel.id, {
        onSuccess: () => {
          showToast('Label deleted.', 'success');
          setDeleteModalOpen(false);
        },
        onError: (err) => showToast(`Error: ${(err as Error).message}`, 'error'),
      });
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Spinner /></div>;
  }

  return (
    <>
      <Card>
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">Labels</h2>
          <Button onClick={() => handleOpenFormModal()} size="sm">
            <PlusIcon className="h-5 w-5 mr-1" />
            Add Label
          </Button>
        </div>
        <ul className="divide-y dark:divide-gray-800">
          {labels?.map((label) => (
            <li key={label.id} className="p-4 flex justify-between items-center">
              <span className="font-medium px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">{label.name}</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => handleOpenFormModal(label)}>
                  <PencilIcon className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleOpenDeleteModal(label)}>
                  <TrashIcon className="h-5 w-5" />
                </Button>
              </div>
            </li>
          ))}
          {labels?.length === 0 && (
            <p className="p-8 text-center text-gray-500">No labels have been added yet.</p>
          )}
        </ul>
      </Card>
      <TaxonomyFormModal
        open={isFormModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSubmit={handleFormSubmit}
        title={selectedLabel ? 'Edit Label' : 'Add Label'}
        initialData={selectedLabel || undefined}
        isSubmitting={isCreating || isUpdating}
      />
      {selectedLabel && (
         <ConfirmationModal
            open={isDeleteModalOpen}
            onClose={() => setDeleteModalOpen(false)}
            onConfirm={handleDeleteConfirm}
            title="Delete Label"
            message={`Are you sure you want to delete the "${selectedLabel.name}" label?`}
            isConfirming={isDeleting}
         />
      )}
    </>
  );
} 