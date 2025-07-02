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
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { PlusIcon, BriefcaseIcon, UserIcon, ChevronRightIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useToast } from "@/context/ToastContext";
import ProjectsCreateModalContext from '@/context/ProjectsCreateModalContext';
import { useRole } from "@/context/RoleContext";
import RoleBadge from "@/components/RoleBadge";
import { useProjectSummary } from "@/hooks/useProjectSummary";
import { useActiveSprint } from "@/hooks/useSprints";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/fetcher";
import { useDebounce } from "use-debounce";
import PageLayout from "@/components/PageLayout";
import Card from "@/components/Card";
import Typography from "@/components/Typography";

const createProjectSchema = z.object({
  name: z.string().min(3, "Project name must be at least 3 characters"),
  key: z.string().min(2, "Key must be at least 2 characters").max(5, "Key must be at most 5 characters").regex(/^[A-Z_]+$/, "Key must be uppercase letters and underscores only"),
  description: z.string().optional(),
  projectLeadId: z.string().optional(),
});

type CreateProjectData = z.infer<typeof createProjectSchema>;

function ProjectCard({ project, role }: { project: Project; role: string | undefined }) {
  const { summary } = useProjectSummary(project.id);
  const { activeSprint, isLoading: isSprintLoading } = useActiveSprint(project.id);

  const progress = summary?.percentDone || 0;

  return (
    <Link key={project.id} href={`/projects/${project.id}`}>
      <Card 
        variant="elevated" 
        padding="lg" 
        hover 
        className="h-full group"
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <Typography 
              variant="caption" 
              className="inline-flex items-center px-3 py-1 bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200 rounded-md"
            >
              {project.key}
            </Typography>
            {activeSprint && !isSprintLoading && (
              <Typography 
                variant="caption" 
                className="bg-success-100 text-success-800 dark:bg-success-900 dark:text-success-200 px-2 py-1 rounded-md"
              >
                {activeSprint.name}
              </Typography>
            )}
          </div>

          {/* Content */}
          <div className="flex-1">
            <Typography 
              variant="h4" 
              className="mb-2 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors"
            >
              {project.name}
            </Typography>
            <Typography 
              variant="body-sm" 
              color="muted" 
              lineClamp={2} 
              className="mb-4"
            >
              {project.description || "No description provided"}
            </Typography>
          </div>

          {/* Progress */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <Typography variant="caption" color="muted">
                Progress
              </Typography>
              <Typography variant="body-sm" weight="semibold">
                {progress}%
              </Typography>
            </div>
            <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary-600 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-neutral-200 dark:border-neutral-700">
            {role ? <RoleBadge role={role} /> : <div />}
            <div className="flex items-center gap-1 text-xs font-medium text-neutral-500 dark:text-neutral-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
              <Typography variant="caption" color="muted" className="group-hover:text-primary-600 dark:group-hover:text-primary-400">
                Open Project 
              </Typography>
              <ChevronRightIcon className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const { projects, isLoading, isError, createProject } = useProjects();
  const { showToast } = useToast();
  const [isModalOpen, setModalOpen] = useState(false);
  const router = useRouter();
  const setOpenModal = useContext(ProjectsCreateModalContext);
  const { isSuperAdmin, projectRoles, loading: rolesLoading } = useRole();

  // User search for Project Lead selection
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedProjectLead, setSelectedProjectLead] = useState<{ id: string; name: string; email: string } | null>(null);
  const [debouncedSearchTerm] = useDebounce(userSearchQuery, 500);

  const { data: users = [], isLoading: searchingUsers } = useQuery<{ id: string; name: string; email: string; avatarUrl?: string }[]>({
    queryKey: ['user-search', debouncedSearchTerm],
    queryFn: () => apiFetch<{ id: string; name: string; email: string; avatarUrl?: string }[]>(`/users/search?term=${debouncedSearchTerm}`),
    enabled: !!debouncedSearchTerm && debouncedSearchTerm.length > 2,
  });

  const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<CreateProjectData>({
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
    if (isLoading || rolesLoading) {
      return (
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <Spinner className="h-8 w-8 mx-auto mb-4" />
            <Typography variant="body-sm" color="muted">
              Loading projects...
            </Typography>
          </div>
        </div>
      );
    }

    if (isError) {
      return (
        <Card variant="outlined" className="text-center p-8">
          <Typography variant="body" color="error" weight="medium">
            Failed to load projects.
          </Typography>
        </Card>
      );
    }

    const visibleProjects: Project[] = isSuperAdmin ? (projects || []) : (projects || []).filter((p) => projectRoles[p.id]);

    if (!visibleProjects || visibleProjects.length === 0) {
      return (
        <Card variant="outlined" className="text-center p-12">
          <div className="space-y-4">
            <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mx-auto">
              <BriefcaseIcon className="h-8 w-8 text-neutral-600 dark:text-neutral-400" />
            </div>
            <div>
              <Typography variant="h3" className="mb-2">
                No projects yet
              </Typography>
              <Typography variant="body" color="muted">
                {isSuperAdmin ? "Get started by creating your first project." : "You are not a member of any projects yet."}
              </Typography>
            </div>
            {isSuperAdmin && (
              <div className="pt-4">
                <Button 
                  onClick={() => setModalOpen(true)}
                  size="lg"
                >
                  <PlusIcon className="h-5 w-5 mr-2" />
                  Create Your First Project
                </Button>
              </div>
            )}
          </div>
        </Card>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleProjects.map((project) => (
          <ProjectCard key={project.id} project={project} role={isSuperAdmin ? 'Super-Admin' : projectRoles[project.id]} />
        ))}
      </div>
    );
  };

  // Action buttons for the header
  const actionButtons = !rolesLoading && isSuperAdmin ? (
    <>
      <Button
        variant="secondary"
        onClick={() => router.push('/manageemployees')}
      >
        <UserIcon className="h-4 w-4 mr-2" />
        Manage Employees
      </Button>
      <Button 
        onClick={() => setModalOpen(true)}
      >
        <PlusIcon className="h-4 w-4 mr-2" />
        Create Project
      </Button>
    </>
  ) : null;

  return (
    <PageLayout
      title="Projects"
      subtitle="Manage and track your projects"
      actions={actionButtons}
    >
      {/* Page Title for Projects */}
      <div className="mb-8">
        <Typography variant="h1" className="mb-2">
          Projects
        </Typography>
        <Typography variant="body" color="muted">
          Manage and track your projects
        </Typography>
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
            <Input id="name" type="text" {...register("name")} placeholder="e.g. Project Phoenix" />
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
            <Input id="description" type="text" {...register("description")} placeholder="A short summary of your project"/>
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
                  placeholder="Search for a user to assign as Project Lead..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="pr-10"
                />
                <MagnifyingGlassIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
              </div>
              
              {/* Selected Project Lead */}
              {selectedProjectLead && (
                <Card variant="outlined" className="mt-2 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Typography variant="body-sm" weight="medium">
                        {selectedProjectLead.name}
                      </Typography>
                      <Typography variant="body-xs" color="muted">
                        {selectedProjectLead.email}
                      </Typography>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedProjectLead(null);
                        setUserSearchQuery('');
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </Card>
              )}
              
              {/* User Search Results */}
              {userSearchQuery.length > 2 && !selectedProjectLead && (
                <Card variant="outlined" className="mt-2 max-h-48 overflow-y-auto">
                  {searchingUsers ? (
                    <div className="p-3 text-center text-neutral-500">
                      <Spinner className="h-4 w-4 mx-auto" />
                    </div>
                  ) : users.length > 0 ? (
                    <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
                      {users.map((user: any) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => {
                            setSelectedProjectLead(user);
                            setUserSearchQuery('');
                          }}
                          className="w-full p-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                        >
                          <Typography variant="body-sm" weight="medium">
                            {user.name}
                          </Typography>
                          <Typography variant="body-xs" color="muted">
                            {user.email}
                          </Typography>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 text-center">
                      <Typography variant="body-xs" color="muted">
                        No users found
                      </Typography>
                    </div>
                  )}
                </Card>
              )}
              
              <Typography variant="body-xs" color="muted" className="mt-1">
                Leave empty to assign yourself as Project Lead
              </Typography>
            </div>
          )}
          
          <div className="flex justify-end gap-3 pt-4">
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
            <Button type="submit" disabled={createProject.isPending}>
              {createProject.isPending ? <Spinner className="h-4 w-4" /> : "Create Project"}
            </Button>
          </div>
        </form>
      </Modal>
    </PageLayout>
  );
} 