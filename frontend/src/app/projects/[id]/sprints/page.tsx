"use client";
import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useSprints, useCreateSprint, Sprint, useUpdateSprint, useArchiveSprint, useStartSprint } from "../../../../hooks/useSprints";
import Card from "../../../../components/Card";
import Button from "../../../../components/Button";
import Modal from "../../../../components/Modal";
import Spinner from "../../../../components/Spinner";
import Input from "../../../../components/Input";
import Typography from "../../../../components/Typography";
import SprintDetailModal from "../../../../components/SprintDetailModal";
import { useSprintIssues } from "../../../../hooks/useSprintIssues";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CalendarDaysIcon, FlagIcon, RocketLaunchIcon, CheckCircleIcon, EyeIcon, PencilSquareIcon, ArchiveBoxXMarkIcon, PlusIcon } from '@heroicons/react/24/outline';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { addDays } from 'date-fns';
import { useProjectRole, useRole } from "../../../../context/RoleContext";

const schema = z.object({
  name: z.string().min(2),
  goal: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function groupSprints(sprints: Sprint[] = []) {
  return {
    active: sprints.filter((s) => s.status === "ACTIVE"),
    upcoming: sprints.filter((s) => s.status === "PLANNED"),
    completed: sprints.filter((s) => s.status === "COMPLETED"),
  };
}

function SprintProgress({ projectId, sprintId }: { projectId: string; sprintId: string }) {
  const { issues, isLoading } = useSprintIssues(projectId, sprintId);
  if (isLoading) return <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full w-full animate-pulse" />;
  const total = issues?.length || 0;
  const done = issues?.filter(i => i.status === 'Done').length || 0;
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mt-2">
      <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
        <div className="h-2 bg-green-500" style={{ width: `${percent}%` }} />
      </div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{done} of {total} done ({percent}%)</div>
    </div>
  );
}

export default function SprintsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { sprints, isLoading, isError } = useSprints(projectId);
  const createSprint = useCreateSprint(projectId);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSprint, setSelectedSprint] = useState<Sprint | null>(null);
  const [editSprint, setEditSprint] = useState<Sprint | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setError,
  } = useForm<FormData>({ resolver: zodResolver(schema) });
  const [sortBy, setSortBy] = useState<'startDate' | 'endDate'>('startDate');
  // Advanced date picker state
  const [startDate, setStartDate] = useState<Date | null>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(addDays(new Date(), 14));
  const [dateError, setDateError] = useState<string | null>(null);
  const [editStartDate, setEditStartDate] = React.useState<Date | null>(null);
  const [editEndDate, setEditEndDate] = React.useState<Date | null>(null);
  const [editDateError, setEditDateError] = React.useState<string | null>(null);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [sprintToComplete, setSprintToComplete] = useState<Sprint | null>(null);
  const [nextSprintId, setNextSprintId] = useState<string | undefined>();
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const archiveSprint = useArchiveSprint(projectId, sprintToComplete?.id || "");
  const [startingSprintId, setStartingSprintId] = useState<string | null>(null);
  const startSprint = useStartSprint(projectId, startingSprintId || "");
  const updateSprint = useUpdateSprint(projectId, editSprint?.id || "");

  // Role-based permissions
  const { isSuperAdmin } = useRole();
  const projectRole = useProjectRole(projectId);
  const effectiveRole = isSuperAdmin ? 'Super-Admin' : projectRole;
  const canCreateSprint = effectiveRole === 'ProjectLead' || effectiveRole === 'Super-Admin';

  useEffect(() => {
    if (editSprint) {
      setEditStartDate(editSprint.startDate ? new Date(editSprint.startDate) : new Date());
      setEditEndDate(editSprint.endDate ? new Date(editSprint.endDate) : addDays(new Date(), 14));
      setEditDateError(null);
    }
  }, [editSprint]);

  const onSubmit = async (data: FormData) => {
    setDateError(null);
    if (!startDate || !endDate) {
      setDateError('Both start and end dates are required.');
      return;
    }
    if (startDate >= endDate) {
      setDateError('End date must be after start date.');
      return;
    }
    try {
      await createSprint.mutateAsync({
        ...data,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      setModalOpen(false);
      reset();
      setStartDate(new Date());
      setEndDate(addDays(new Date(), 14));
    } catch (e: unknown) {
      const message = e && typeof e === 'object' && 'message' in e ? (e as { message?: string }).message : undefined;
      setError('root', { message: message || 'Failed to create sprint' });
    }
  };

  const grouped = groupSprints(sprints);

  // Helper for edit modal: only reset if editing a new sprint
  const handleEditSprint = (sprint: Sprint) => {
    setEditSprint(sprint);
    if (!editSprint || editSprint.id !== sprint.id) {
      reset({
        name: sprint.name,
        goal: sprint.goal || "",
        startDate: sprint.startDate,
        endDate: sprint.endDate,
      });
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      {/* Header */}
      <div className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 px-6 py-6">
        <div className="flex items-center gap-3">
          <RocketLaunchIcon className="h-8 w-8 text-neutral-600 dark:text-neutral-400" />
          <div>
            <Typography variant="h1" className="text-neutral-900 dark:text-white">
              Sprints
            </Typography>
            <Typography variant="body" className="text-neutral-600 dark:text-neutral-400 mt-1">
              Plan, track, and deliver work in focused iterations.
            </Typography>
          </div>
        </div>
      </div>

      {/* Sprint Sections */}
      <div className="p-6">
      {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="text-center">
              <Spinner className="h-8 w-8 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
              <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
                Loading sprints...
              </Typography>
            </div>
          </div>
      ) : isError ? (
          <div className="text-center py-16">
            <Typography variant="h3" className="text-red-600 dark:text-red-400 mb-2">
              Failed to load sprints
            </Typography>
            <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
              Please try refreshing the page
            </Typography>
        </div>
      ) : (
          <div className="space-y-8">
          {Object.entries(grouped)
            .filter(([status]) => status !== 'archived')
            .map(([status, sprints]) => {
              const sectionIcons: Record<string, React.ReactElement> = {
                  active: <RocketLaunchIcon className="h-6 w-6 text-green-600" />,
                  upcoming: <FlagIcon className="h-6 w-6 text-blue-600" />,
                  completed: <CheckCircleIcon className="h-6 w-6 text-purple-600" />,
              };
                
              // Sort sprints within group
              const sortedSprints = [...sprints].sort((a, b) => {
                const aDate = a[sortBy] ? new Date(a[sortBy]!) : new Date(0);
                const bDate = b[sortBy] ? new Date(b[sortBy]!) : new Date(0);
                return bDate.getTime() - aDate.getTime();
              });
                
              return (
                  <div key={status} className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6"> 
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                    {sectionIcons[status]}
                        <Typography variant="h2" className="text-neutral-900 dark:text-white">
                      {status === 'active' && 'Active Sprints'}
                      {status === 'upcoming' && 'Planned Sprints'}
                      {status === 'completed' && 'Completed Sprints'}
                        </Typography>
                      </div>
                      <div className="flex items-center gap-2">
                        <Typography variant="label" className="text-neutral-600 dark:text-neutral-400">
                          Sort by:
                        </Typography>
                      <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as 'startDate' | 'endDate')}
                          className="px-3 py-1 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
                      >
                        <option value="startDate">Start Date</option>
                        <option value="endDate">End Date</option>
                      </select>
                    </div>
                  </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedSprints.length === 0 ? (
                      <div className="col-span-full flex flex-col items-center justify-center py-12">
                          <div className="w-16 h-16 rounded-lg bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center mb-4">
                            <FlagIcon className="h-8 w-8 text-neutral-400" />
                        </div>
                          <Typography variant="body" className="text-neutral-500 dark:text-neutral-400">
                            No {status} sprints.
                          </Typography>
                      </div>
                    ) : sortedSprints.map((sprint: Sprint) => (
                        <Card key={sprint.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer group relative" onClick={() => setSelectedSprint(sprint)}>
                          <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <button
                              className="p-1 rounded-md bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
                            aria-label="View Sprint"
                            title="View Sprint"
                            onClick={e => { e.stopPropagation(); setSelectedSprint(sprint); }}
                          >
                              <EyeIcon className="h-4 w-4 text-white" />
                          </button>
                          {(status === 'active' || status === 'upcoming') && canCreateSprint && (
                            <>
                              <button
                                  className="p-1 rounded-md bg-green-500 hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 transition-colors"
                                aria-label="Edit Sprint"
                                title="Edit Sprint"
                                onClick={e => { e.stopPropagation(); handleEditSprint(sprint); }}
                              >
                                  <PencilSquareIcon className="h-4 w-4 text-white" />
                              </button>
                              <button
                                  className="p-1 rounded-md bg-red-500 hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 transition-colors"
                                aria-label="Archive Sprint"
                                title="Archive Sprint"
                                onClick={e => {
                                  e.stopPropagation();
                                  setSprintToComplete(sprint);
                                  setCompleteModalOpen(true);
                                }}
                              >
                                  <ArchiveBoxXMarkIcon className="h-4 w-4 text-white" />
                              </button>
                            </>
                          )}
                        </div>
                          
                          <div className="flex items-center justify-between mb-3">
                            <Typography variant="h3" className="text-neutral-900 dark:text-neutral-100">
                            {sprint.name}
                            </Typography>
                            <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize
                              ${sprint.status === 'ACTIVE' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : ''}
                              ${sprint.status === 'PLANNED' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : ''}
                              ${sprint.status === 'COMPLETED' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' : ''}
                          `}>
                            {sprint.status.toLowerCase()}
                          </span>
                        </div>
                          
                          {sprint.goal && (
                            <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-3 flex items-center gap-2">
                              <FlagIcon className="h-4 w-4 text-blue-500" />
                              {sprint.goal}
                            </div>
                          )}
                          
                          <div className="flex gap-4 text-xs text-neutral-500 dark:text-neutral-400 mb-3">
                            {sprint.startDate && (
                              <span className="flex items-center gap-1">
                                <CalendarDaysIcon className="h-4 w-4" />
                                Start: {new Date(sprint.startDate).toLocaleDateString()}
                              </span>
                            )}
                            {sprint.endDate && (
                              <span className="flex items-center gap-1">
                                <CalendarDaysIcon className="h-4 w-4" />
                                End: {new Date(sprint.endDate).toLocaleDateString()}
                              </span>
                            )}
                        </div>
                          
                        <SprintProgress projectId={projectId} sprintId={sprint.id} />
                          
                        {status === 'upcoming' && canCreateSprint && (
                          <Button
                            onClick={e => {
                              e.stopPropagation();
                              setStartingSprintId(sprint.id);
                              startSprint.mutate(undefined, {
                                onSettled: () => setStartingSprintId(null)
                              });
                            }}
                            loading={startSprint.isPending && startingSprintId === sprint.id}
                              variant="primary"
                              size="sm"
                              className="mt-3 w-full"
                          >
                            Start Sprint
                          </Button>
                        )}
                          
                        {startSprint.isError && startingSprintId === sprint.id && (
                            <Typography variant="body-sm" className="text-red-600 dark:text-red-400 mt-2">
                              {startSprint.error instanceof Error ? startSprint.error.message : 'Failed to start sprint.'}
                            </Typography>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}
      </div>

      {/* Create Sprint Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create Sprint">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Name" {...register("name")}
            error={errors.name?.message} autoFocus />
          <Input label="Goal" {...register("goal")}
            error={errors.goal?.message} />
          <div>
            <Typography variant="label" className="text-neutral-700 dark:text-neutral-300 mb-2">
              Start Date
            </Typography>
            <DatePicker
              selected={startDate}
              onChange={date => setStartDate(date)}
              selectsStart
              startDate={startDate}
              endDate={endDate}
              showTimeSelect
              dateFormat="Pp"
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
              placeholderText="Select start date"
            />
          </div>
          <div>
            <Typography variant="label" className="text-neutral-700 dark:text-neutral-300 mb-2">
              End Date
            </Typography>
            <DatePicker
              selected={endDate}
              onChange={date => setEndDate(date)}
              selectsEnd
              startDate={startDate}
              endDate={endDate}
              minDate={startDate ?? undefined}
              showTimeSelect
              dateFormat="Pp"
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
              placeholderText="Select end date"
            />
          </div>
          {dateError && <Typography variant="body-sm" className="text-red-600 dark:text-red-400">{dateError}</Typography>}
          {errors.root?.message && <Typography variant="body-sm" className="text-red-600 dark:text-red-400">{errors.root.message}</Typography>}
          <Button type="submit" loading={createSprint.isPending} variant="primary" className="w-full">
            Create Sprint
          </Button>
        </form>
      </Modal>

      {/* Edit Sprint Modal */}
      {editSprint && (
        <Modal open={!!editSprint} onClose={() => setEditSprint(null)} title="Edit Sprint">
          <form onSubmit={handleSubmit(async (data) => {
            setEditDateError(null);
            if (!editStartDate || !editEndDate) {
              setEditDateError('Both start and end dates are required.');
              return;
            }
            if (editStartDate >= editEndDate) {
              setEditDateError('End date must be after start date.');
              return;
            }
            await updateSprint.mutateAsync({
              ...data,
              startDate: editStartDate.toISOString(),
              endDate: editEndDate.toISOString(),
            });
            setEditSprint(null);
            reset();
          })} className="space-y-4">
            <Input label="Name" {...register('name')} error={errors.name?.message} autoFocus />
            <Input label="Goal" {...register('goal')} error={errors.goal?.message} />
            <div>
              <Typography variant="label" className="text-neutral-700 dark:text-neutral-300 mb-2">
                Start Date
              </Typography>
              <DatePicker
                selected={editStartDate}
                onChange={date => setEditStartDate(date)}
                selectsStart
                startDate={editStartDate}
                endDate={editEndDate}
                showTimeSelect
                dateFormat="Pp"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
                placeholderText="Select start date"
              />
            </div>
            <div>
              <Typography variant="label" className="text-neutral-700 dark:text-neutral-300 mb-2">
                End Date
              </Typography>
              <DatePicker
                selected={editEndDate}
                onChange={date => setEditEndDate(date)}
                selectsEnd
                startDate={editStartDate}
                endDate={editEndDate}
                minDate={editStartDate ?? undefined}
                showTimeSelect
                dateFormat="Pp"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
                placeholderText="Select end date"
              />
            </div>
            {editDateError && <Typography variant="body-sm" className="text-red-600 dark:text-red-400">{editDateError}</Typography>}
            {errors.root?.message && <Typography variant="body-sm" className="text-red-600 dark:text-red-400">{errors.root.message}</Typography>}
            <Button type="submit" loading={updateSprint.isPending} variant="primary" className="w-full">
              Save Changes
            </Button>
          </form>
        </Modal>
      )}

      {/* Sprint Detail Modal */}
      {selectedSprint && (
        <SprintDetailModal
          open={!!selectedSprint}
          onClose={() => setSelectedSprint(null)}
          sprint={selectedSprint}
          projectId={projectId}
        />
      )}

      {/* Complete Sprint Modal */}
      <Modal open={completeModalOpen} onClose={() => { setCompleteModalOpen(false); setSprintToComplete(null); setNextSprintId(undefined); setArchiveError(null); }} title="Complete Sprint">
        <div className="space-y-6">
          <Typography variant="body" className="text-neutral-900 dark:text-neutral-100">
            Where should incomplete issues be moved?
          </Typography>
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors">
              <input
                type="radio"
                checked={!nextSprintId}
                onChange={() => setNextSprintId(undefined)}
                className="text-blue-500"
              />
              <Typography variant="body" className="text-neutral-700 dark:text-neutral-200">
                Backlog
              </Typography>
            </label>
            <label className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors">
              <input
                type="radio"
                checked={!!nextSprintId}
                onChange={() => {
                  const available = grouped.active.filter(s => s.id !== sprintToComplete?.id);
                  setNextSprintId(available.length > 0 ? available[0].id : "");
                }}
                disabled={grouped.active.filter(s => s.id !== sprintToComplete?.id).length === 0}
                className="text-green-500"
              />
              <Typography variant="body" className="text-neutral-700 dark:text-neutral-200">
                Next Sprint:
              </Typography>
              <select
                value={nextSprintId || ''}
                onChange={e => {
                  setNextSprintId(e.target.value);
                }}
                disabled={grouped.active.filter(s => s.id !== sprintToComplete?.id).length === 0}
                className="ml-2 border border-neutral-300 dark:border-neutral-600 rounded-md px-3 py-1 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 dark:focus:border-green-400 transition-colors"
              >
                <option value="">Select sprint</option>
                {grouped.active.filter(s => s.id !== sprintToComplete?.id).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          </div>
          {archiveError && <Typography variant="body-sm" className="text-red-600 dark:text-red-400">{archiveError}</Typography>}
          <Button
            onClick={async () => {
              if (!sprintToComplete) return;
              setArchiveError(null);
              if (!!nextSprintId && nextSprintId === "") {
                setArchiveError("Please select a next sprint.");
                return;
              }
              try {
                await archiveSprint.mutateAsync(nextSprintId);
                setCompleteModalOpen(false);
                setSprintToComplete(null);
                setNextSprintId(undefined);
              } catch (e: unknown) {
                const errorMessage = e instanceof Error ? e.message : 'Failed to complete sprint.';
                setArchiveError(errorMessage);
              }
            }}
            loading={archiveSprint.isPending}
            variant="primary"
            className="w-full"
            disabled={!!nextSprintId && nextSprintId === ""}
          >
            Complete Sprint
          </Button>
        </div>
      </Modal>

      {/* Add floating action button - only show for ProjectLeads and Super-Admins */}
      {canCreateSprint && (
        <button
          onClick={() => setModalOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-400"
          aria-label="Create Sprint"
          title="Create Sprint"
        >
          <PlusIcon className="h-5 w-5" />
          <span>Create Sprint</span>
        </button>
      )}
    </div>
  );
} 