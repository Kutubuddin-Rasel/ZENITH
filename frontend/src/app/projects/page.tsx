"use client";
import React, { useState, useContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import Button from "../../components/Button";
import Modal from "../../components/Modal";
import Spinner from "../../components/Spinner";
import { useProjects, Project } from "../../hooks/useProjects";
import Input from "../../components/Input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import { PlusIcon, UserIcon, MagnifyingGlassIcon, SparklesIcon, Cog6ToothIcon, FolderIcon, EllipsisHorizontalIcon, ArchiveBoxIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useToast } from "@/context/ToastContext";
import ProjectsCreateModalContext from '@/context/ProjectsCreateModalContext';
import ProjectWizard from '../../components/ProjectWizard/ProjectWizard';
import ConfirmationModal from '../../components/ConfirmationModal';

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}
import { useRole } from "@/context/RoleContext";
import { useProjectSummary } from "@/hooks/useProjectSummary";
import { useActiveSprint } from "@/hooks/useSprints";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import { useDebounce } from "use-debounce";
import PageLayout from "@/components/PageLayout";
import Typography from "@/components/Typography";
import ProjectCardSkeleton from "@/components/skeletons/ProjectCardSkeleton";
import FadeIn from "@/components/animations/FadeIn";
import { motion } from "framer-motion";
import { Menu, Transition } from "@headlessui/react";
import { Fragment } from "react";

const createProjectSchema = z.object({
  name: z.string().min(3, "Project name must be at least 3 characters"),
  key: z.string().min(2, "Key must be at least 2 characters").max(5, "Key must be at most 5 characters").regex(/^[A-Z_]+$/, "Key must be uppercase letters and underscores only"),
  description: z.string().optional(),
  projectLeadId: z.string().optional(),
});

type CreateProjectData = z.infer<typeof createProjectSchema>;

function ProjectCard({ project, role, onArchive, onDelete }: { project: Project; role: string | undefined; onArchive: (id: string) => void; onDelete: (id: string) => void }) {
  const { summary } = useProjectSummary(project.id);
  const { activeSprint, isLoading: isSprintLoading } = useActiveSprint(project.id);

  const progress = summary?.percentDone || 0;
  const isOwnerOrAdmin = role === 'Super-Admin' || role === 'ProjectLead';

  // Premium Rich Gradients
  const bgGradients = [
    'from-indigo-500 via-purple-500 to-pink-500', // Nebula
    'from-emerald-400 via-teal-500 to-cyan-600',   // Ocean
    'from-orange-400 via-amber-500 to-yellow-500', // Sunset
    'from-rose-500 via-red-500 to-orange-500',     // Fire
    'from-blue-600 via-indigo-600 to-violet-600',  // Deep Blue
    'from-slate-600 via-zinc-600 to-neutral-600'   // Monochrome
  ];
  const colorIndex = project.key.length % bgGradients.length;
  const badgeGradient = bgGradients[colorIndex];

  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.2, ease: "easeOut" } }}
      className="group relative h-full flex flex-col bg-white dark:bg-[#1C1C1E] rounded-xl border border-neutral-200/80 dark:border-white/5 shadow-sm hover:shadow-xl hover:shadow-neutral-200/50 dark:hover:shadow-black/40 hover:border-neutral-300 dark:hover:border-white/10 transition-colors duration-300 overflow-hidden"
    >
      {/* 
        Fix: Interaction Layer 
        The Link covers the whole card but sits at z-0. 
        Interactive elements (like the menu) sit at z-10/20 on top.
      */}
      <Link href={`/projects/${project.id}`} className="absolute inset-0 z-0" aria-label={`View project ${project.name}`} />

      <div className="flex-1 flex flex-col p-6 pointer-events-none relative z-10">
        {/* Header: Icon + Meta */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex gap-4">
            {/* Project Icon */}
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${badgeGradient} shadow-lg shadow-black/10 flex items-center justify-center shrink-0`}>
              <span className="text-lg font-bold text-white tracking-tight drop-shadow-md">
                {project.key.substring(0, 2)}
              </span>
            </div>

            <div className="flex flex-col pt-0.5 min-w-0">
              {/* Title */}
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white truncate max-w-[180px] leading-tight group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                {project.name}
              </h3>

              {/* Meta Row: Key + Role */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-bold text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-white/5">
                  {project.key}
                </span>

                {role && role !== 'Member' && (
                  <span className={`
                       px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border
                       ${role === 'Super-Admin'
                      ? 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800/30'
                      : 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800/30'}
                     `}>
                    {role === 'Super-Admin' ? 'Admin' : 'Lead'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Menu (Top Right)
              Crucial: 'pointer-events-auto' restores clickability to this div 
              since parent has 'pointer-events-none' to let clicks pass through to the Link.
          */}
          {isOwnerOrAdmin && (
            <div className="pointer-events-auto opacity-0 group-hover:opacity-100 transition-all duration-200 focus-within:opacity-100 -mr-2 -mt-2">
              <Menu as="div" className="relative inline-block text-left">
                <Menu.Button className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors">
                  <EllipsisHorizontalIcon className="h-6 w-6" />
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
                  <Menu.Items className="absolute right-0 mt-1 w-48 origin-top-right bg-white dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 rounded-xl shadow-xl ring-1 ring-black/5 focus:outline-none z-50 overflow-hidden divide-y divide-neutral-100 dark:divide-white/5">
                    <div className="p-1">
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onArchive(project.id);
                            }}
                            className={`${active ? 'bg-neutral-50 dark:bg-white/5' : ''} group flex w-full items-center rounded-lg px-2 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 transition-colors`}
                          >
                            <ArchiveBoxIcon className="mr-2 h-4 w-4 text-neutral-400 group-hover:text-neutral-500" aria-hidden="true" />
                            Archive Project
                          </button>
                        )}
                      </Menu.Item>
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onDelete(project.id);
                            }}
                            className={`${active ? 'bg-red-50 dark:bg-red-900/20' : ''} group flex w-full items-center rounded-lg px-2 py-2 text-xs font-medium text-red-600 dark:text-red-400 transition-colors`}
                          >
                            <TrashIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                            Delete Project
                          </button>
                        )}
                      </Menu.Item>
                    </div>
                  </Menu.Items>
                </Transition>
              </Menu>
            </div>
          )}
        </div>

        {/* Description */}
        <div className="mb-6 min-h-[48px]">
          {project.description ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed">
              {project.description}
            </p>
          ) : (
            <span className="text-sm text-neutral-400 dark:text-neutral-600 italic">
              No description visible
            </span>
          )}
        </div>

        {/* Footer Info: Sprint & Progress */}
        <div className="mt-auto flex items-end justify-between">
          {/* Sprint Status */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
              Current Sprint
            </span>
            {activeSprint && !isSprintLoading ? (
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  {activeSprint.name}
                </span>
              </div>
            ) : (
              <span className="text-xs text-neutral-500 dark:text-neutral-500 font-medium">No active sprint</span>
            )}
          </div>

          {/* Progress */}
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-semibold text-neutral-900 dark:text-white">{progress}% Done</span>
            <div className="w-20 h-1.5 bg-neutral-100 dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-neutral-800 to-neutral-600 dark:from-white dark:to-neutral-400 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function ProjectsPage() {
  const { projects, isLoading, isError, createProject, deleteProject, archiveProject } = useProjects();
  const { showToast } = useToast();
  const [isModalOpen, setModalOpen] = useState(false);
  const router = useRouter();
  const setOpenModal = useContext(ProjectsCreateModalContext);
  const { isSuperAdmin, projectRoles, loading: rolesLoading } = useRole();

  // User search for Project Lead selection
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedProjectLead, setSelectedProjectLead] = useState<{ id: string; name: string; email: string } | null>(null);

  // Confirmation Modal State
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    confirmButtonVariant?: 'primary' | 'secondary' | 'danger';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
  });

  // New state for intelligent onboarding
  const [showProjectWizard, setShowProjectWizard] = useState(false);
  const [debouncedSearchTerm] = useDebounce(userSearchQuery, 500);

  const { data: users = [], isLoading: searchingUsers } = useQuery<{ id: string; name: string; email: string; avatarUrl?: string }[]>({
    queryKey: ['user-search', debouncedSearchTerm],
    queryFn: () => apiFetch<{ id: string; name: string; email: string; avatarUrl?: string }[]>(`/users/search?term=${debouncedSearchTerm}`),
    enabled: !!debouncedSearchTerm && debouncedSearchTerm.length > 2,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateProjectData>({
    resolver: zodResolver(createProjectSchema),
  });

  useEffect(() => {
    if (setOpenModal) {
      setOpenModal(() => setModalOpen(true));
    }
    return () => {
      if (setOpenModal) setOpenModal(undefined);
    };
  }, [setOpenModal, setModalOpen]);

  useEffect(() => {
    setModalOpen(false);
  }, []);

  const handleCreateProject = (data: CreateProjectData) => {
    const projectData = {
      ...data,
      projectLeadId: selectedProjectLead?.id || undefined,
    };

    createProject.mutate(projectData, {
      onSuccess: () => {
        showToast('Project created successfully!', 'success');
        setModalOpen(false);
        reset();
        setSelectedProjectLead(null);
        setUserSearchQuery('');
      },
      onError: (error: Error) => {
        showToast(`Error: ${error.message}`, 'error');
      }
    });
  };

  const renderContent = () => {
    // Animation variants for staggered card entry
    const containerVariants = {
      hidden: { opacity: 0 },
      show: {
        opacity: 1,
        transition: {
          staggerChildren: 0.05
        }
      }
    };

    const itemVariants = {
      hidden: { opacity: 0, scale: 0.95 },
      show: {
        opacity: 1,
        scale: 1,
        transition: { type: "spring" as const, stiffness: 100, damping: 15 }
      }
    };

    if (isLoading || rolesLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(6)].map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      );
    }

    if (isError) {
      return (
        <FadeIn>
          <div className="flex flex-col items-center justify-center h-96 text-center p-8 bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-100 dark:border-red-900/20">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-400">
              <Cog6ToothIcon className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">Failed to load projects</h3>
            <p className="text-red-600 dark:text-red-300 mb-6 max-w-md">
              We encountered an issue while fetching your projects. Please check your connection and try again.
            </p>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </div>
        </FadeIn>
      );
    }

    const visibleProjects: Project[] = isSuperAdmin ? (projects || []) : (projects || []).filter((p) => projectRoles[p.id]);

    if (!visibleProjects || visibleProjects.length === 0) {
      return (
        <FadeIn>
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white dark:bg-neutral-800 rounded-3xl border border-dashed border-neutral-300 dark:border-neutral-700">
            <div className="w-20 h-20 bg-neutral-100 dark:bg-neutral-800 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
              <FolderIcon className="h-10 w-10 text-neutral-400 dark:text-neutral-500" />
            </div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-3">
              No projects found
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400 max-w-md mb-8 leading-relaxed">
              {isSuperAdmin
                ? "Get started by creating your first project to track issues, manage sprints, and collaborate with your team."
                : "You haven't been added to any projects yet. Contact your workspace administrator to get started."}
            </p>
            {isSuperAdmin && (
              <div className="flex gap-4">
                <Button
                  onClick={() => setModalOpen(true)}
                  size="lg"
                  className="shadow-xl shadow-blue-500/20"
                >
                  <PlusIcon className="h-5 w-5 mr-2" />
                  Create Project
                </Button>
                <Button
                  onClick={() => setShowProjectWizard(true)}
                  variant="secondary"
                  size="lg"
                >
                  <SparklesIcon className="h-5 w-5 mr-2 text-purple-500" />
                  Use Wizard
                </Button>
              </div>
            )}
          </div>
        </FadeIn>
      );
    }

    return (
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* Quick Add Card for Admins - Always first */}
        {isSuperAdmin && (
          <motion.button
            variants={itemVariants}
            onClick={() => setModalOpen(true)}
            whileHover={{ y: -4, transition: { duration: 0.2, ease: "easeOut" } }}
            className="group h-full min-h-[220px] w-full flex flex-col items-center justify-center bg-white dark:bg-[#1C1C1E] rounded-xl border border-neutral-200/80 dark:border-white/5 hover:border-blue-500/50 dark:hover:border-blue-500/50 hover:shadow-lg transition-all duration-300 transform"
          >
            <div className="w-16 h-16 rounded-3xl bg-neutral-50 dark:bg-white/5 group-hover:bg-blue-50 dark:group-hover:bg-blue-500/10 flex items-center justify-center mb-5 transition-colors duration-300">
              <PlusIcon className="h-8 w-8 text-neutral-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            </div>
            <span className="font-semibold text-lg text-neutral-600 dark:text-neutral-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Create Project</span>
          </motion.button>
        )}

        {visibleProjects.map((project) => (
          <motion.div key={project.id} variants={itemVariants}>
            <ProjectCard
              project={project}
              role={isSuperAdmin ? 'Super-Admin' : projectRoles[project.id]}
              onArchive={(id) => {
                setConfirmationModal({
                  isOpen: true,
                  title: 'Archive Project',
                  message: `Are you sure you want to archive "${project.name}"? This action can be undone later.`,
                  confirmText: 'Archive',
                  confirmButtonVariant: 'secondary',
                  onConfirm: () => {
                    archiveProject.mutate(id, {
                      onSuccess: () => {
                        showToast('Project archived successfully', 'success');
                        setConfirmationModal((prev) => ({ ...prev, isOpen: false }));
                      },
                      onError: (error: Error) => {
                        showToast(`Failed to archive project: ${error.message}`, 'error');
                        setConfirmationModal((prev) => ({ ...prev, isOpen: false }));
                      }
                    });
                  }
                });
              }}
              onDelete={(id) => {
                setConfirmationModal({
                  isOpen: true,
                  title: 'Delete Project',
                  message: `Are you sure you want to permanently delete "${project.name}"? This action cannot be undone.`,
                  confirmText: 'Delete',
                  confirmButtonVariant: 'danger',
                  onConfirm: () => {
                    deleteProject.mutate(id, {
                      onSuccess: () => {
                        showToast('Project deleted successfully', 'success');
                        setConfirmationModal((prev) => ({ ...prev, isOpen: false }));
                      },
                      onError: (error: Error) => {
                        showToast(`Failed to delete project: ${error.message}`, 'error');
                        setConfirmationModal((prev) => ({ ...prev, isOpen: false }));
                      }
                    });
                  }
                });
              }}
            />
          </motion.div>
        ))}
      </motion.div>
    );
  };

  // Action buttons for the header
  const actionButtons = !rolesLoading && isSuperAdmin ? (
    <div className="flex items-center gap-3">
      <Button
        variant="secondary"
        onClick={() => router.push('/manageemployees')}
        className="hidden sm:flex"
      >
        <UserIcon className="h-4 w-4 mr-2" />
        Manage Team
      </Button>
      <Button
        variant="primary"
        onClick={() => setModalOpen(true)}
        className="shadow-lg shadow-primary-500/20"
      >
        <PlusIcon className="h-4 w-4 mr-2" />
        New Project
      </Button>
    </div>
  ) : null;

  return (
    <PageLayout
      title="Projects"
      subtitle="Overview of all workspace projects."
      actions={actionButtons}
      className="max-w-[1600px] mx-auto"
    >
      {/* Page Title for Projects - Mobile */}
      <div className="mb-6 md:hidden">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Projects</h1>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm">Manage and track your projects</p>
      </div>

      {renderContent()}

      <Modal open={isModalOpen} onClose={() => {
        setModalOpen(false);
        setSelectedProjectLead(null);
        setUserSearchQuery('');
      }} title="Create a New Project">
        <form onSubmit={handleSubmit(handleCreateProject)} className="space-y-6">
          <div>
            <Typography variant="label" className="block mb-2">
              Project Name
            </Typography>
            <Input id="name" type="text" {...register("name")} placeholder="e.g. Project Phoenix" autoFocus />
            {errors.name && (
              <Typography variant="body-xs" color="error" className="mt-1">
                {errors.name.message}
              </Typography>
            )}
          </div>

          <div>
            <Typography variant="label" className="block mb-2">
              Project Key
            </Typography>
            <Input id="key" type="text" {...register("key")} placeholder="e.g. PHOENIX" />
            <p className="mt-1 text-xs text-neutral-500">Unique identifier for issues (e.g. PHOENIX-123)</p>
            {errors.key && (
              <Typography variant="body-xs" color="error" className="mt-1">
                {errors.key.message}
              </Typography>
            )}
          </div>

          <div>
            <Typography variant="label" className="block mb-2">
              Description (Optional)
            </Typography>
            <Input id="description" type="text" {...register("description")} placeholder="A short summary of your project" />
            {errors.description && (
              <Typography variant="body-xs" color="error" className="mt-1">
                {errors.description.message}
              </Typography>
            )}
          </div>

          {/* Project Lead Selection - Only show for Super-Admins */}
          {isSuperAdmin && (
            <div>
              <Typography variant="label" className="block mb-2">
                Project Lead (Optional)
              </Typography>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search for a user..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="pr-10"
                />
                <MagnifyingGlassIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
              </div>

              {/* Selected Project Lead */}
              {selectedProjectLead && (
                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-300 font-bold text-xs">
                      {selectedProjectLead.name[0]}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-blue-900 dark:text-blue-100">{selectedProjectLead.name}</div>
                      <div className="text-xs text-blue-700 dark:text-blue-300">{selectedProjectLead.email}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProjectLead(null);
                      setUserSearchQuery('');
                    }}
                    className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200 text-xs font-medium"
                  >
                    Remove
                  </button>
                </div>
              )}

              {/* User Search Results */}
              {userSearchQuery.length > 2 && !selectedProjectLead && (
                <div className="mt-2 max-h-48 overflow-y-auto bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg z-10">
                  {searchingUsers ? (
                    <div className="p-4 text-center text-neutral-500">
                      <Spinner className="h-4 w-4 mx-auto mb-2" />
                      <span className="text-xs">Searching...</span>
                    </div>
                  ) : users.length > 0 ? (
                    <div className="divide-y divide-neutral-100 dark:divide-neutral-700">
                      {users.map((user: User) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => {
                            setSelectedProjectLead(user);
                            setUserSearchQuery('');
                          }}
                          className="w-full p-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors flex items-center gap-3"
                        >
                          <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center text-neutral-600 dark:text-neutral-300 font-bold text-xs">
                            {user.name[0]}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-neutral-900 dark:text-white">{user.name}</div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">{user.email}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-sm text-neutral-500">No users found</p>
                    </div>
                  )}
                </div>
              )}

              <p className="mt-1 text-xs text-neutral-500">
                Leave empty to assign yourself as Project Lead
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-800">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setModalOpen(false);
                setSelectedProjectLead(null);
                setUserSearchQuery('');
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createProject.isPending} loading={createProject.isPending}>
              Create Project
            </Button>
          </div>
        </form>
      </Modal>

      {/* Project Wizard Modal */}
      <ProjectWizard
        isOpen={showProjectWizard}
        onClose={() => setShowProjectWizard(false)}
        onProjectCreated={() => {
          showToast('Project created successfully!', 'success');
          setShowProjectWizard(false);
        }}
      />

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={() => setConfirmationModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmationModal.onConfirm}
        title={confirmationModal.title}
        message={confirmationModal.message}
        confirmText={confirmationModal.confirmText}
        confirmButtonVariant={confirmationModal.confirmButtonVariant}
      />

    </PageLayout>
  );
}