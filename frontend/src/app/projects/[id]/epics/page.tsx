"use client";
import React, { useState, Fragment } from "react";
import { useParams } from "next/navigation";
import { useEpics, useCreateEpic, useArchiveEpic, Epic } from "../../../../hooks/useEpics";
import Card from "../../../../components/Card";
import Button from "../../../../components/Button";
import Modal from "../../../../components/Modal";
import Spinner from "../../../../components/Spinner";
import Input from "../../../../components/Input";
import EpicDetailModal from "../../../../components/EpicDetailModal";
import ConfirmationModal from "../../../../components/ConfirmationModal";
import { useEpicStories } from "../../../../hooks/useEpicStories";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Menu, Transition } from "@headlessui/react";
import { EllipsisVerticalIcon, PencilIcon, ArchiveBoxIcon, PlusIcon, RocketLaunchIcon, CalendarIcon } from "@heroicons/react/24/solid";

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  dueDate: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const statusColors = {
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  closed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  archived: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

function groupEpics(epics: Epic[] = []) {
  return {
    open: epics.filter((e) => e.status === "open"),
    closed: epics.filter((e) => e.status === "closed"),
    archived: epics.filter((e) => e.status === "archived"),
  };
}

function EpicProgress({ projectId, epicId }: { projectId: string; epicId: string }) {
  const { stories, isLoading } = useEpicStories(projectId, epicId);
  if (isLoading) return <div className="h-2.5 bg-gray-200 dark:bg-gray-800 rounded-full w-full animate-pulse" />;
  const total = stories?.length || 0;
  const done = stories?.filter(s => s.status === 'Done').length || 0;
  const percent = total ? Math.round((done / total) * 100) : 0;

  const byStatus = stories?.reduce((acc, story) => {
    acc[story.status] = (acc[story.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mb-1">
        <span>Progress</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className="h-2.5 bg-green-500 rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex gap-2 mt-2 flex-wrap">
        {Object.entries(byStatus).map(([status, count]) => (
          <span key={status} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
            {status}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function EpicsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { epics, isLoading, isError } = useEpics(projectId);
  const createEpic = useCreateEpic(projectId);
  const archiveEpic = useArchiveEpic(projectId);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEpic, setSelectedEpic] = useState<Epic | null>(null);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [epicToArchive, setEpicToArchive] = useState<Epic | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setError,
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      await createEpic.mutateAsync(data);
      setModalOpen(false);
      reset();
    } catch (e: unknown) {
      const message = e && typeof e === 'object' && 'message' in e ? (e as { message?: string }).message : undefined;
      setError("root", { message: message || "Failed to create epic" });
    }
  };
  
  const handleArchiveClick = (epic: Epic) => {
    setEpicToArchive(epic);
    setArchiveModalOpen(true);
  };

  const handleConfirmArchive = async () => {
    if (epicToArchive) {
      await archiveEpic.mutateAsync(epicToArchive.id);
      setArchiveModalOpen(false);
      setEpicToArchive(null);
    }
  };

  const grouped = groupEpics(epics);

  const renderEmptyState = () => (
    <div className="text-center py-24">
      <RocketLaunchIcon className="mx-auto h-20 w-20 text-gray-300 dark:text-gray-600" />
      <h3 className="mt-4 text-2xl font-bold text-gray-800 dark:text-gray-200">Plan big with Epics</h3>
      <p className="mt-2 text-base text-gray-500 dark:text-gray-400">Break down large initiatives into manageable stories and track progress effectively.</p>
      <div className="mt-8">
        <Button onClick={() => setModalOpen(true)} size="lg">
          <PlusIcon className="h-5 w-5 mr-2" />
          Create your first epic
        </Button>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-[calc(100vh-200px)]">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold">Epics</h2>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : isError ? (
        <div className="text-center py-16 text-red-500">Failed to load epics. Please try again later.</div>
      ) : epics && epics.length > 0 ? (
        <div className="space-y-10">
          {Object.entries(grouped).map(([status, epicList]) => (
            epicList.length > 0 && (
              <div key={status}>
                <h3 className="text-xl font-bold mb-4 capitalize flex items-center gap-3">
                  {status} Epics
                  <span className="text-sm font-normal bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2.5 py-1 rounded-full">{epicList.length}</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {epicList.map((epic: Epic) => (
                    <Card key={epic.id} className="flex flex-col gap-2 group !p-5 transition-all hover:shadow-2xl hover:-translate-y-1">
                      <div className="flex items-start justify-between">
                        <div 
                          className="font-bold text-accent-blue text-lg cursor-pointer hover:underline"
                          onClick={() => setSelectedEpic(epic)}
                        >
                          {epic.name}
                        </div>
                        <Menu as="div" className="relative">
                          <Menu.Button className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                            <EllipsisVerticalIcon className="h-5 w-5 text-gray-500" />
                          </Menu.Button>
                          <Transition
                            as={Fragment}
                            enter="transition ease-out duration-100"
                            enterFrom="transform opacity-0 scale-95"
                            enterTo="transform opacity-100 scale-100"
                            leave="transition ease-in duration-75"
                            leaveFrom="transform opacity-100 scale-100"
                            leaveTo="transform opacity-0 scale-95"
                          >
                            <Menu.Items className="absolute right-0 mt-2 w-48 origin-top-right bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
                              <div className="px-1 py-1">
                                <Menu.Item>
                                  {({ active }) => (
                                    <button
                                      onClick={() => setSelectedEpic(epic)}
                                      className={`${active ? 'bg-gray-100 dark:bg-gray-800' : ''} group flex w-full items-center rounded-md px-2 py-2 text-sm text-gray-900 dark:text-gray-200`}>
                                      <PencilIcon className="mr-2 h-4 w-4" /> Edit
                                    </button>
                                  )}
                                </Menu.Item>
                                <Menu.Item>
                                  {({ active }) => (
                                    <button
                                      onClick={() => handleArchiveClick(epic)}
                                      className={`${active ? 'bg-gray-100 dark:bg-gray-800' : ''} group flex w-full items-center rounded-md px-2 py-2 text-sm text-gray-900 dark:text-gray-200`}>
                                      <ArchiveBoxIcon className="mr-2 h-4 w-4" /> Archive
                                    </button>
                                  )}
                                </Menu.Item>
                              </div>
                            </Menu.Items>
                          </Transition>
                        </Menu>
                      </div>

                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${statusColors[epic.status as keyof typeof statusColors]}`}>
                        {epic.status}
                      </span>

                      {epic.description && (
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">{epic.description}</div>
                      )}

                      {epic.dueDate && (
                        <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 mt-2">
                          <CalendarIcon className="h-4 w-4" />
                          <span>Due {new Date(epic.dueDate).toLocaleDateString()}</span>
                        </div>
                      )}

                      <EpicProgress projectId={projectId} epicId={epic.id} />
                    </Card>
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      ) : (
        renderEmptyState()
      )}

      {epics && epics.length > 0 && (
        <button
          onClick={() => setModalOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-6 py-4 rounded-full bg-gradient-to-r from-green-400 to-blue-500 text-white font-bold shadow-2xl hover:scale-105 hover:shadow-green-400/30 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-blue-300"
          aria-label="Create Epic"
        >
          <PlusIcon className="h-6 w-6" />
          Create Epic
        </button>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create Epic">
        <form onSubmit={handleSubmit(onSubmit)}>
          <Input label="Name" {...register("name")}
            error={errors.name?.message} autoFocus />
          <Input label="Description" {...register("description")}
            error={errors.description?.message} />
          <Input
            type="date"
            label="Due Date"
            {...register("dueDate")}
            error={errors.dueDate?.message}
          />
          {errors.root?.message && <div className="text-red-500 text-sm mt-2">{errors.root.message}</div>}
          <Button type="submit" loading={createEpic.isPending} fullWidth className="mt-4">Create Epic</Button>
        </form>
      </Modal>

      {selectedEpic && (
        <EpicDetailModal
          open={!!selectedEpic}
          onClose={() => setSelectedEpic(null)}
          epic={selectedEpic}
          projectId={projectId}
        />
      )}
      
      <ConfirmationModal
        open={archiveModalOpen}
        onClose={() => setArchiveModalOpen(false)}
        onConfirm={handleConfirmArchive}
        title="Archive Epic"
        message={`Are you sure you want to archive the epic "${epicToArchive?.name}"? This action can be reversed later.`}
        confirmText="Archive"
        isConfirming={archiveEpic.isPending}
      />
    </div>
  );
} 