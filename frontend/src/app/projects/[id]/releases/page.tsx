"use client";
import React, { useState, Fragment } from "react";
import { useParams } from "next/navigation";
import { useReleases, useCreateRelease, useUpdateRelease, useArchiveRelease, Release } from "../../../../hooks/useReleases";
import Card from "../../../../components/Card";
import Button from "../../../../components/Button";
import Modal from "../../../../components/Modal";
import Spinner from "../../../../components/Spinner";
import Input from "../../../../components/Input";
import ReleaseDetailModal from "../../../../components/ReleaseDetailModal";
import { useReleaseIssues } from "../../../../hooks/useReleaseIssues";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Menu, Transition } from "@headlessui/react";
import { EllipsisVerticalIcon, PencilIcon, ArchiveBoxIcon, PlusIcon, RocketLaunchIcon, SparklesIcon } from "@heroicons/react/24/solid";
import ConfirmationModal from "../../../../components/ConfirmationModal";
import { apiFetch } from "../../../../lib/fetcher";


const schema = z.object({
  name: z.string().min(2),
  releaseDate: z.string().optional(),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function groupReleases(releases: Release[] = []) {
  return {
    upcoming: releases.filter((r) => r.status === "upcoming"),
    released: releases.filter((r) => r.status === "released"),
    archived: releases.filter((r) => r.status === "archived"),
  };
}

function ReleaseProgress({ projectId, releaseId }: { projectId: string; releaseId: string }) {
  const { issues, isLoading } = useReleaseIssues(projectId, releaseId);
  if (isLoading) return <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full w-full animate-pulse" />;
  const total = issues?.length || 0;
  const done = issues?.filter(i => i.status === 'Done').length || 0;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mt-4">
      <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mb-1">
        <span>Progress</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className="h-2.5 bg-green-500 rounded-full" style={{ width: `${percent}%` }} />
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 text-right">{done} of {total} issues done</div>
    </div>
  );
}

const ReleaseStatusBadge = ({ status }: { status: string }) => {
  const baseClasses = "text-xs font-semibold px-2.5 py-0.5 rounded-full";
  const statusClasses = {
    upcoming: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    released: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    archived: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  };
  const classes = `${baseClasses} ${statusClasses[status as keyof typeof statusClasses] || statusClasses.archived}`;
  return <span className={classes}>{status}</span>;
}

export default function ReleasesPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { releases, isLoading, isError } = useReleases(projectId);
  const createRelease = useCreateRelease(projectId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRelease, setEditingRelease] = useState<Release | null>(null);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [releaseToArchive, setReleaseToArchive] = useState<Release | null>(null);

  const updateRelease = useUpdateRelease(projectId, editingRelease?.id || '');
  const archiveRelease = useArchiveRelease(projectId, releaseToArchive?.id || '');

  // Version suggestion state
  const [versionSuggestion, setVersionSuggestion] = useState<{
    suggested: string;
    current: string | null;
  } | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
    setError,
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const fetchVersionSuggestion = async (bumpType: 'major' | 'minor' | 'patch' = 'patch') => {
    setLoadingSuggestion(true);
    try {
      const data = await apiFetch<{ suggested: string; current: string | null }>(`/projects/${projectId}/releases/suggest-version/${bumpType}`);
      setVersionSuggestion(data);
      setValue('name', data.suggested);
    } catch {
      // Ignore errors
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingRelease(null);
    reset({ name: '', description: '', releaseDate: '' });
    setVersionSuggestion(null);
    setModalOpen(true);
    // Fetch initial suggestion
    fetchVersionSuggestion('patch');
  }


  const handleOpenEditModal = (release: Release) => {
    setEditingRelease(release);
    reset({
      name: release.name,
      description: release.description || '',
      releaseDate: release.releaseDate ? new Date(release.releaseDate).toISOString().split('T')[0] : ''
    });
    setModalOpen(true);
  }

  const onSubmit = async (data: FormData) => {
    try {
      if (editingRelease) {
        await updateRelease.mutateAsync(data);
      } else {
        await createRelease.mutateAsync(data);
      }
      setModalOpen(false);
    } catch (e: unknown) {
      const message = e && typeof e === 'object' && 'message' in e ? (e as { message?: string }).message : undefined;
      setError("root", { message: message || "Failed to create release" });
    }
  };

  const grouped = groupReleases(releases);

  const renderEmptyState = () => (
    <div className="text-center py-24">
      <RocketLaunchIcon className="mx-auto h-20 w-20 text-gray-300 dark:text-gray-600" />
      <h3 className="mt-4 text-2xl font-bold text-gray-800 dark:text-gray-200">Manage your product versions</h3>
      <p className="mt-2 text-base text-gray-500 dark:text-gray-400">Group issues into releases to plan and track your product launches.</p>
      <div className="mt-8">
        <Button onClick={handleOpenCreateModal} size="lg">
          <PlusIcon className="h-5 w-5 mr-2" />
          Create your first release
        </Button>
      </div>
    </div>
  );

  const renderReleases = () => (
    <div className="space-y-10">
      {Object.entries(grouped).map(([status, releaseList]) => (
        releaseList.length > 0 && (
          <div key={status}>
            <h3 className="text-xl font-bold mb-4 capitalize flex items-center gap-3">
              {status} Releases
              <span className="text-sm font-normal bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2.5 py-1 rounded-full">{releaseList.length}</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {releaseList.map((release: Release) => (
                <Card key={release.id} className="flex flex-col gap-2 group !p-5 transition-all hover:shadow-2xl hover:-translate-y-1">
                  <div className="flex items-start justify-between">
                    <div
                      className="font-bold text-accent-blue text-lg cursor-pointer hover:underline"
                      onClick={() => setSelectedRelease(release)}
                    >
                      {release.name}
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
                                  onClick={() => handleOpenEditModal(release)}
                                  className={`${active ? 'bg-gray-100 dark:bg-gray-800' : ''} group flex w-full items-center rounded-md px-2 py-2 text-sm text-gray-900 dark:text-gray-200`}>
                                  <PencilIcon className="mr-2 h-4 w-4" /> Edit
                                </button>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={() => setReleaseToArchive(release)}
                                  className={`${active ? 'bg-red-500 text-white' : 'text-gray-900 dark:text-gray-200'} group flex w-full items-center rounded-md px-2 py-2 text-sm`}>
                                  <ArchiveBoxIcon className="mr-2 h-4 w-4" /> Archive
                                </button>
                              )}
                            </Menu.Item>
                          </div>
                        </Menu.Items>
                      </Transition>
                    </Menu>
                  </div>
                  <ReleaseStatusBadge status={release.status} />

                  {release.description && <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">{release.description}</div>}
                  <div className="flex-grow" />
                  <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400 mt-3">
                    {release.releaseDate && <span><strong>Release:</strong> {new Date(release.releaseDate).toLocaleDateString()}</span>}
                  </div>
                  <ReleaseProgress projectId={projectId} releaseId={release.id} />
                </Card>
              ))}
            </div>
          </div>
        )
      ))}
    </div>
  );

  return (
    <div className="relative min-h-[calc(100vh-200px)]">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold">Releases</h2>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : isError ? (
        <div className="text-center py-16 text-red-500">Failed to load releases. Please try again later.</div>
      ) : releases && releases.length > 0 ? (
        renderReleases()
      ) : (
        renderEmptyState()
      )}

      {releases && releases.length > 0 && (
        <button
          onClick={handleOpenCreateModal}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-6 py-4 rounded-full bg-gradient-to-r from-green-400 to-blue-500 text-white font-bold shadow-2xl hover:scale-105 hover:shadow-green-400/30 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-blue-300"
          aria-label="Create Release"
        >
          <PlusIcon className="h-6 w-6" />
          Create Release
        </button>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingRelease ? "Edit Release" : "Create Release"}>
        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Version Suggestion (only for new releases) */}
          {!editingRelease && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <SparklesIcon className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Version Suggestion</span>
                {loadingSuggestion && <Spinner className="h-4 w-4" />}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fetchVersionSuggestion('patch')}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-200"
                >
                  Patch
                </button>
                <button
                  type="button"
                  onClick={() => fetchVersionSuggestion('minor')}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200"
                >
                  Minor
                </button>
                <button
                  type="button"
                  onClick={() => fetchVersionSuggestion('major')}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-200"
                >
                  Major
                </button>
              </div>
              {versionSuggestion?.current && (
                <p className="text-xs text-gray-500 mt-1">Current: {versionSuggestion.current}</p>
              )}
            </div>
          )}
          <Input label="Name" {...register("name")}
            error={errors.name?.message} autoFocus />
          <Input label="Release Date" type="date" {...register("releaseDate")}
            error={errors.releaseDate?.message} />
          <Input label="Description" {...register("description")}
            error={errors.description?.message} />
          {errors.root?.message && <div className="text-red-500 text-sm mt-2">{errors.root.message}</div>}
          <Button type="submit" loading={createRelease.isPending || updateRelease.isPending} fullWidth className="mt-4">
            {editingRelease ? 'Save Changes' : 'Create Release'}

          </Button>
        </form>
      </Modal>

      <ConfirmationModal
        open={!!releaseToArchive}
        onClose={() => setReleaseToArchive(null)}
        onConfirm={async () => {
          await archiveRelease.mutateAsync();
          setReleaseToArchive(null);
        }}
        title="Archive Release"
        message={`Are you sure you want to archive the release "${releaseToArchive?.name}"? This action cannot be undone.`}
        confirmText="Archive"
        isConfirming={archiveRelease.isPending}
      />

      {selectedRelease && (
        <ReleaseDetailModal
          open={!!selectedRelease}
          onClose={() => setSelectedRelease(null)}
          release={selectedRelease}
          projectId={projectId}
        />
      )}
    </div>
  );
} 