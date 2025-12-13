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
import { PlusIcon, UserIcon, MagnifyingGlassIcon, SparklesIcon, Cog6ToothIcon, FolderIcon } from "@heroicons/react/24/outline";
import { useToast } from "@/context/ToastContext";
import ProjectsCreateModalContext from '@/context/ProjectsCreateModalContext';
import ProjectWizard from '../../components/ProjectWizard/ProjectWizard';

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}
import { useRole } from "@/context/RoleContext";
import RoleBadge from "@/components/RoleBadge";
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

const createProjectSchema = z.object({
  name: z.string().min(3, "Project name must be at least 3 characters"),
  key: z.string().min(2, "Key must be at least 2 characters").max(5, "Key must be at most 5 characters").regex(/^[A-Z_]+$/, "Key must be uppercase letters and underscores only"),
  description: z.string().optional(),
  projectLeadId: z.string().optional(),
});

type CreateProjectData = z.infer<typeof createProjectSchema>;

import { Menu, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { TrashIcon, ArchiveBoxIcon, EllipsisHorizontalIcon } from "@heroicons/react/24/outline";

function ProjectCard({ project, role, onArchive, onDelete }: { project: Project; role: string | undefined; onArchive: (id: string) => void; onDelete: (id: string) => void }) {
  const { summary } = useProjectSummary(project.id);
  const { activeSprint, isLoading: isSprintLoading } = useActiveSprint(project.id);

  const progress = summary?.percentDone || 0;
  const isOwnerOrAdmin = role === 'Super-Admin' || role === 'ProjectLead';

  return (
    <div className="group h-full bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-blue-500/50 dark:hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 overflow-hidden flex flex-col relative">
      {/* Card Content Link */}
      <Link href={`/projects/${project.id}`} className="flex-1 flex flex-col p-6 pb-0">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-md shrink-0">
              {project.key.substring(0, 2)}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate pr-4">
                {project.name}
              </h3>
              <p className="text-xs font-mono text-neutral-500 dark:text-neutral-400">
                {project.key}
              </p>
            </div>
          </div>
        </div>

        {/* Sprints & Status Badges */}
        <div className="mb-4 flex flex-wrap gap-2">
          {activeSprint && !isSprintLoading && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse"></span>
              Sprint Active
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2 mb-6 flex-1">
          {project.description || "No description provided."}
        </p>

        {/* Progress Section */}
        <div className="mt-auto mb-6">
          <div className="flex justify-between items-end mb-2">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Progress</span>
            <span className="text-sm font-bold text-neutral-900 dark:text-white">{progress}%</span>
          </div>
          <div className="w-full bg-neutral-100 dark:bg-neutral-700 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-purple-600 h-1.5 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </Link>

      {/* Footer */}
      <div className="px-6 py-4 bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {role ? <RoleBadge role={role} /> : <span className="text-xs text-neutral-400">Member</span>}
        </div>

        <div className="flex items-center gap-2">
          {/* Admin Actions Menu */}
          {isOwnerOrAdmin && (
            <Menu as="div" className="relative ml-2">
              <Menu.Button className="p-1.5 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 transition-colors" onClick={(e) => e.stopPropagation()}>
                <EllipsisHorizontalIcon className="h-5 w-5" />
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
                <Menu.Items className="absolute right-0 bottom-full mb-2 w-48 origin-bottom-right bg-white dark:bg-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-700 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
                  <div className="px-1 py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={(e) => { e.stopPropagation(); onArchive(project.id); }}
                          className={`${active ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'text-neutral-700 dark:text-neutral-300'
                            } group flex w-full items-center rounded-md px-2 py-2 text-sm`}
                        >
                          <ArchiveBoxIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                          Archive Project
                        </button>
                      )}
                    </Menu.Item>
                  </div>
                  <div className="px-1 py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(project.id); }}
                          className={`${active ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'text-red-600 dark:text-red-400'
                            } group flex w-full items-center rounded-md px-2 py-2 text-sm`}
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
          )}
        </div>
      </div>
    </div>
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
          staggerChildren: 0.1
        }
      }
    };

    const itemVariants = {
      hidden: { opacity: 0, y: 20 },
      show: {
        opacity: 1,
        y: 0,
        transition: { type: "spring" as const, stiffness: 50 }
      }
    };

    if (isLoading || rolesLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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



    // Actually, I need to get deleteProject/archiveProject from the hook result
    // But destructured { createProject } earlier.

    if (!visibleProjects || visibleProjects.length === 0) {
      return (
        <FadeIn>
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white dark:bg-neutral-800 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700">
            <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6">
              <FolderIcon className="h-10 w-10 text-blue-500 dark:text-blue-400" />
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
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {visibleProjects.map((project) => (
          <motion.div key={project.id} variants={itemVariants}>
            <ProjectCard
              project={project}
              role={isSuperAdmin ? 'Super-Admin' : projectRoles[project.id]}
              onArchive={(id) => {
                if (confirm("Archive " + project.name + "?")) archiveProject.mutate(id);
              }}
              onDelete={(id) => {
                if (confirm("Delete " + project.name + " permanently?")) deleteProject.mutate(id);
              }}
            />
          </motion.div>
        ))}

        {/* Quick Add Card for Admins */}
        {isSuperAdmin && (
          <motion.button
            variants={itemVariants}
            onClick={() => setModalOpen(true)}
            className="group h-full min-h-[280px] w-full flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all duration-300"
          >
            <div className="w-14 h-14 rounded-full bg-white dark:bg-neutral-800 shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
              <PlusIcon className="h-6 w-6 text-neutral-400 group-hover:text-blue-500 transition-colors" />
            </div>
            <span className="font-semibold text-neutral-600 dark:text-neutral-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Create New Project</span>
          </motion.button>
        )}
      </motion.div>
    );
  };

  // Action buttons for the header
  const actionButtons = !rolesLoading && isSuperAdmin ? (
    <div className="flex items-center gap-3">
      <Button
        variant="secondary"
        onClick={() => router.push('/manageemployees')}
      >
        <UserIcon className="h-4 w-4 mr-2" />
        Manage Employees
      </Button>
      <Button
        onClick={() => setModalOpen(true)}
        className="shadow-lg shadow-blue-500/20"
      >
        <PlusIcon className="h-4 w-4 mr-2" />
        New Project
      </Button>
      <Button
        variant="secondary"
        onClick={() => setShowProjectWizard(true)}
        className="hidden sm:flex"
      >
        <SparklesIcon className="h-4 w-4 mr-2 text-purple-500" />
        Smart Setup
      </Button>
    </div>
  ) : null;

  return (
    <PageLayout
      title="Projects"
      subtitle="Manage and track your team's work across projects."
      actions={actionButtons}
    >
      {/* Page Title for Projects - Hidden on mobile as PageLayout handles it, but kept for structure if needed */}
      <div className="mb-8 md:hidden">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Projects</h1>
        <p className="text-neutral-500 dark:text-neutral-400">Manage and track your projects</p>
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

    </PageLayout>
  );
} 