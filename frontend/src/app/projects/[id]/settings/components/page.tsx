"use client";
import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Spinner from '@/components/Spinner';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/context/ToastContext';
import {
  useComponents,
  useCreateComponent,
  useUpdateComponent,
  useDeleteComponent,
  Component,
} from '@/hooks/useTaxonomy';
import TaxonomyFormModal from '@/components/TaxonomyFormModal';
import ConfirmationModal from '@/components/ConfirmationModal';

export default function ComponentsSettingsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { showToast } = useToast();

  const [isFormModalOpen, setFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null);

  const { data: components, isLoading } = useComponents(projectId);
  const { mutate: createComponent, isPending: isCreating } = useCreateComponent(projectId);
  const { mutate: updateComponent, isPending: isUpdating } = useUpdateComponent(projectId);
  const { mutate: deleteComponent, isPending: isDeleting } = useDeleteComponent(projectId);

  const handleOpenFormModal = (component: Component | null = null) => {
    setSelectedComponent(component);
    setFormModalOpen(true);
  };

  const handleOpenDeleteModal = (component: Component) => {
    setSelectedComponent(component);
    setDeleteModalOpen(true);
  };

  const handleFormSubmit = (data: { name: string }) => {
    if (selectedComponent) {
      updateComponent({ id: selectedComponent.id, name: data.name }, {
        onSuccess: () => {
          showToast('Component updated.', 'success');
          setFormModalOpen(false);
        },
        onError: (err) => showToast(`Error: ${(err as Error).message}`, 'error'),
      });
    } else {
      createComponent({ name: data.name }, {
        onSuccess: () => {
          showToast('Component created.', 'success');
          setFormModalOpen(false);
        },
        onError: (err) => showToast(`Error: ${(err as Error).message}`, 'error'),
      });
    }
  };

  const handleDeleteConfirm = () => {
    if (selectedComponent) {
      deleteComponent(selectedComponent.id, {
        onSuccess: () => {
          showToast('Component deleted.', 'success');
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
          <h2 className="text-xl font-bold">Components</h2>
          <Button onClick={() => handleOpenFormModal()} size="sm">
            <PlusIcon className="h-5 w-5 mr-1" />
            Add Component
          </Button>
        </div>
        <ul className="divide-y dark:divide-gray-800">
          {components?.map((component) => (
            <li key={component.id} className="p-4 flex justify-between items-center">
              <span className="font-medium">{component.name}</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => handleOpenFormModal(component)}>
                  <PencilIcon className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleOpenDeleteModal(component)}>
                  <TrashIcon className="h-5 w-5" />
                </Button>
              </div>
            </li>
          ))}
          {components?.length === 0 && (
            <p className="p-8 text-center text-gray-500">No components have been added yet.</p>
          )}
        </ul>
      </Card>
      <TaxonomyFormModal
        open={isFormModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSubmit={handleFormSubmit}
        title={selectedComponent ? 'Edit Component' : 'Add Component'}
        initialData={selectedComponent || undefined}
        isSubmitting={isCreating || isUpdating}
      />
      {selectedComponent && (
        <ConfirmationModal
          isOpen={isDeleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          onConfirm={handleDeleteConfirm}
          title="Delete Component"
          message={`Are you sure you want to delete the "${selectedComponent.name}" component?`}
          isLoading={isDeleting}
        />
      )}
    </>
  );
} 