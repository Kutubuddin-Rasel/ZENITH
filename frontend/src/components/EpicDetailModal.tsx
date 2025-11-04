import React, { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Spinner from './Spinner';
import { Epic, useUpdateEpic } from '../hooks/useEpics';
import { useEpicStories, useAssignStoryToEpic, useUnassignStoryFromEpic } from '../hooks/useEpicStories';
import { useBacklog } from '../hooks/useBacklog';
import { useEpicAttachments, EpicAttachment } from '../hooks/useEpics';
import Image from 'next/image';
import { useCombobox } from 'downshift';
import { PencilIcon, XMarkIcon, ChevronUpDownIcon, DocumentTextIcon, PaperClipIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

interface EpicDetailModalProps {
  open: boolean;
  onClose: () => void;
  epic: Epic;
  projectId: string;
}

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  dueDate: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const EpicDetailModal = ({ open, onClose, epic, projectId }: EpicDetailModalProps) => {
  const { stories, isLoading: loadingStories, isError: errorStories } = useEpicStories(projectId, epic.id);
  const { issues: backlogIssues } = useBacklog(projectId);
  const assignStory = useAssignStoryToEpic(projectId, epic.id);
  const unassignStory = useUnassignStoryFromEpic(projectId, epic.id);
  const updateEpic = useUpdateEpic(projectId, epic.id);
  const [activeTab, setActiveTab] = React.useState<'stories' | 'attachments' | 'details'>('stories');
  const [isEditing, setIsEditing] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: epic.name,
      description: epic.description,
      dueDate: epic.dueDate,
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await updateEpic.mutateAsync(data);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update epic:', error);
    }
  };

  // Progress calculations
  const total = stories?.length || 0;
  const done = stories?.filter(s => s.status === 'Done').length || 0;
  const percent = total ? Math.round((done / total) * 100) : 0;

  // Status breakdown
  const statusBreakdown = stories?.reduce((acc, story) => {
    acc[story.status] = (acc[story.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  // Searchable dropdown for backlog issues
  const [inputValue, setInputValue] = useState('');
  const filteredIssues = backlogIssues?.filter(
    issue => issue.title.toLowerCase().includes(inputValue.toLowerCase())
  ) || [];

  const {
    isOpen,
    getMenuProps,
    getInputProps,
    getItemProps,
    highlightedIndex,
  } = useCombobox({
    items: filteredIssues,
    onInputValueChange: ({ inputValue }) => {
      setInputValue(inputValue || '');
    },
    itemToString: (item) => item?.title || '',
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) {
        assignStory.mutate(selectedItem.id);
        setInputValue('');
      }
    },
  });

  return (
    <Modal open={open} onClose={onClose} maxWidthClass="sm:max-w-2xl">
      <div className="flex flex-col h-[80vh]">
        {/* Header */}
        <div className="flex-shrink-0 border-b dark:border-gray-700 pb-4">
          {isEditing ? (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <input
                {...register('name')}
                className="w-full text-2xl font-bold bg-transparent border-b border-gray-300 dark:border-gray-700 focus:border-accent-blue focus:ring-0 px-0"
                autoFocus
              />
              {errors.name && <p className="text-red-500 text-sm">{errors.name.message}</p>}
              
              <textarea
                {...register('description')}
                className="w-full bg-transparent border rounded-md p-2 focus:border-accent-blue focus:ring-0"
                rows={3}
                placeholder="Add a description..."
              />
              
              <div className="flex gap-4">
                <input
                  type="date"
                  {...register('dueDate')}
                  className="bg-transparent border rounded-md p-2 focus:border-accent-blue focus:ring-0"
                />
                <Button type="submit" loading={updateEpic.isPending}>Save</Button>
                <Button variant="secondary" onClick={() => {
                  setIsEditing(false);
                  reset();
                }}>Cancel</Button>
              </div>
            </form>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <h2 className="text-2xl font-bold">{epic.name}</h2>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <PencilIcon className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              {epic.description && (
                <p className="text-gray-600 dark:text-gray-400">{epic.description}</p>
              )}
              {epic.dueDate && (
                <p className="text-sm text-gray-500">Due: {new Date(epic.dueDate).toLocaleDateString()}</p>
              )}
            </div>
          )}

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between items-center text-sm mb-1">
              <span className="text-gray-600 dark:text-gray-400">Progress</span>
              <span className="font-semibold">{percent}%</span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b dark:border-gray-700 mt-4">
          <button
            className={`pb-2 font-medium ${
              activeTab === 'stories'
                ? 'text-accent-blue border-b-2 border-accent-blue'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('stories')}
          >
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="h-5 w-5" />
              Stories
            </div>
          </button>
          <button
            className={`pb-2 font-medium ${
              activeTab === 'attachments'
                ? 'text-accent-blue border-b-2 border-accent-blue'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('attachments')}
          >
            <div className="flex items-center gap-2">
              <PaperClipIcon className="h-5 w-5" />
              Attachments
            </div>
          </button>
          <button
            className={`pb-2 font-medium ${
              activeTab === 'details'
                ? 'text-accent-blue border-b-2 border-accent-blue'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('details')}
          >
            <div className="flex items-center gap-2">
              <ChartBarIcon className="h-5 w-5" />
              Details
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto mt-4">
          {activeTab === 'stories' && (
            <div className="space-y-6">
              {/* Add story section */}
              <div className="relative">
                <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700">
                  <div className="relative flex-1">
                    <input
                      {...getInputProps()}
                      placeholder="Search and add stories..."
                      className="w-full py-2 px-3 rounded-lg bg-transparent focus:ring-0 border-0"
                    />
                    <button className="absolute right-2 top-1/2 -translate-y-1/2">
                      <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
                    </button>
                  </div>
                </div>

                <ul
                  {...getMenuProps()}
                  className={`absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 max-h-60 overflow-auto ${
                    !isOpen && 'hidden'
                  }`}
                >
                  {isOpen &&
                    filteredIssues.map((item, index) => (
                      <li
                        key={item.id}
                        {...getItemProps({ item, index })}
                        className={`px-3 py-2 cursor-pointer ${
                          highlightedIndex === index
                            ? 'bg-gray-100 dark:bg-gray-700'
                            : ''
                        }`}
                      >
                        <div className="font-medium">{item.title}</div>
                        <div className="text-sm text-gray-500">{item.status}</div>
                      </li>
                    ))}
                </ul>
              </div>

              {/* Stories list */}
              <div className="space-y-2">
                {loadingStories ? (
                  <div className="flex justify-center py-8">
                    <Spinner className="h-6 w-6" />
                  </div>
                ) : errorStories ? (
                  <div className="text-red-500 text-center">Failed to load stories.</div>
                ) : stories && stories.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No stories added to this epic yet.
                  </div>
                ) : (
                  stories?.map((story) => (
                    <div
                      key={story.id}
                      className="flex items-center gap-4 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border dark:border-gray-700 group"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{story.title}</div>
                        <div className="flex gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            story.status === 'Done'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                          }`}>
                            {story.status}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => unassignStory.mutate(story.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <XMarkIcon className="h-5 w-5 text-gray-500" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'attachments' && (
            <EpicAttachmentsTab projectId={projectId} epicId={epic.id} />
          )}

          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Status breakdown */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border dark:border-gray-700">
                <h3 className="font-semibold mb-4">Status Breakdown</h3>
                <div className="space-y-3">
                  {Object.entries(statusBreakdown).map(([status, count]) => (
                    <div key={status} className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium">{status}</span>
                          <span className="text-sm text-gray-500">{count}</span>
                        </div>
                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent-blue transition-all duration-500"
                            style={{ width: `${(count / total) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional epic details can be added here */}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

function EpicAttachmentsTab({ projectId, epicId }: { projectId: string; epicId: string }) {
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
  } = useEpicAttachments(projectId, epicId);
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

  async function handleDeleteAttachment(a: EpicAttachment) {
    await deleteAttachment(a.id);
  }

  function renderFileIconOrThumb(a: EpicAttachment) {
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

export default EpicDetailModal; 