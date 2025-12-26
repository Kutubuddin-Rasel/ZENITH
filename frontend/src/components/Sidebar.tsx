"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HomeIcon,
  ListBulletIcon,
  ClipboardIcon,
  Squares2X2Icon,
  TagIcon,
  Cog6ToothIcon,
  ExclamationCircleIcon,
  PaperClipIcon,
  UserGroupIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/24/outline';
import Button from './Button';
import { useProjectRole, useRole } from '../context/RoleContext';
import { useActiveSprint } from '../hooks/useSprints';
import Typography from './Typography';
import Card from './Card';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/fetcher';
import Tooltip from './Tooltip';
import { useAppearance } from '../context/AppearanceContext';

// Sidebar item config with role access
const sidebarItems = [
  {
    name: 'Overview',
    href: '',
    icon: HomeIcon,
    roles: ['Super-Admin', 'ProjectLead', 'Developer', 'QA', 'Viewer']
  },
  {
    name: 'Backlog',
    href: 'backlog',
    icon: ListBulletIcon,
    roles: ['Super-Admin', 'ProjectLead', 'Developer', 'QA', 'Viewer']
  },
  {
    name: 'Board',
    href: 'boards',
    icon: ClipboardIcon,
    roles: ['Super-Admin', 'ProjectLead', 'Developer', 'QA', 'Viewer']
  },
  {
    name: 'Active Sprint',
    href: 'sprints',
    icon: Squares2X2Icon,
    roles: ['Super-Admin', 'ProjectLead', 'Developer', 'QA', 'Viewer'],
    conditional: 'activeSprint' // Only show if there's an active sprint
  },
  {
    name: 'All Sprints',
    href: 'sprints',
    icon: Squares2X2Icon,
    roles: ['Super-Admin', 'ProjectLead', 'Developer', 'QA', 'Viewer']
  },
  {
    name: 'Releases',
    href: 'releases',
    icon: TagIcon,
    roles: ['Super-Admin', 'ProjectLead', 'Developer', 'QA', 'Viewer']
  },
  {
    name: 'Issues',
    href: 'issues',
    icon: ExclamationCircleIcon,
    roles: ['Super-Admin', 'ProjectLead', 'Developer', 'QA', 'Viewer']
  },
  {
    name: 'Attachments',
    href: 'attachments',
    icon: PaperClipIcon,
    roles: ['Super-Admin', 'ProjectLead', 'Developer', 'QA', 'Viewer']
  },
  {
    name: 'Insights',
    href: 'insights',
    icon: PresentationChartLineIcon,
    roles: ['Super-Admin', 'ProjectLead', 'Developer'] // Combined access from both modules
  },
  {
    name: 'Team',
    href: 'team',
    icon: UserGroupIcon,
    roles: ['Super-Admin', 'ProjectLead'] // Only Super-Admin & ProjectLead
  },
  {
    name: 'Settings',
    href: 'settings',
    icon: Cog6ToothIcon,
    roles: ['Super-Admin', 'ProjectLead'] // Only Super-Admin & ProjectLead
  },

];

const Sidebar = ({ projectId }: { projectId?: string }) => {
  const pathname = usePathname();
  const { isSuperAdmin } = useRole();
  const projectRole = useProjectRole(projectId || '');
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const { settings, setSidebarStyle } = useAppearance();

  // Sync isCollapsed from AppearanceContext
  const isCollapsed = settings.sidebarStyle === 'compact';
  const setIsCollapsed = (collapsed: boolean) => {
    setSidebarStyle(collapsed ? 'compact' : 'default');
  };

  const queryClient = useQueryClient();

  // Always use 'Super-Admin' for effectiveRole if isSuperAdmin is true
  const effectiveRole = isSuperAdmin ? 'Super-Admin' : projectRole;

  // Prefetching handlers
  const handlePrefetch = (name: string) => {
    if (!projectId) return;

    switch (name) {
      case 'Issues':
        queryClient.prefetchQuery({
          queryKey: ['project-issues', projectId, undefined],
          queryFn: () => apiFetch(`/projects/${projectId}/issues`),
          staleTime: 1000 * 60 * 5, // 5 minutes
        });
        break;
      case 'All Sprints':
      case 'Active Sprint':
        queryClient.prefetchQuery({
          queryKey: ['sprints', projectId],
          queryFn: () => apiFetch(`/projects/${projectId}/sprints`),
          staleTime: 1000 * 60 * 5,
        });
        break;
      case 'Board':
        queryClient.prefetchQuery({
          queryKey: ['project-boards', projectId],
          queryFn: () => apiFetch(`/projects/${projectId}/boards`),
          staleTime: 1000 * 60 * 5,
        });
        break;
    }
  };

  // Fetch active sprint for badge and link
  const { activeSprint } = useActiveSprint(projectId || '');

  // Determine current route for highlighting
  const isOnAllSprints = pathname === `/projects/${projectId}/sprints`;
  const isOnActiveSprint = activeSprint && pathname === `/projects/${projectId}/sprints/${activeSprint.id}`;

  return (
    <aside
      className={`h-screen flex flex-col bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 shadow-sm transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-56'
        }`}
    >
      {/* Header section */}
      <div className={`p-6 border-b border-neutral-200 dark:border-neutral-800 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        <Link
          href="/projects"
          className="flex items-center justify-center hover:opacity-80 transition-opacity duration-200 group"
        >
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow duration-200 shrink-0">
            <span className="text-white font-semibold text-sm">Z</span>
          </div>
          {!isCollapsed && (
            <Typography variant="h5" className="ml-3 text-primary-600 dark:text-primary-400 font-bold hidden sm:block truncate">
              Zenith
            </Typography>
          )}
        </Link>

      </div>

      {/* Navigation */}
      {(projectId && projectId.trim() !== '' && effectiveRole) || isSuperAdmin ? (
        <nav className="flex-1 py-4 px-2 overflow-y-auto no-scrollbar space-y-0.5">
          <ul className="space-y-1">
            {sidebarItems
              .filter(item => {
                // If no project selected, only show global items (Manage Employees)
                if (!projectId || projectId.trim() === '') {
                  return item.href === '/manageemployees';
                }

                // Check role access
                if (!effectiveRole || !item.roles.includes(effectiveRole)) {
                  return false;
                }

                // Check conditional visibility
                if (item.conditional === 'activeSprint') {
                  return !!activeSprint; // Only show Active Sprint if there is an active sprint
                }

                return true;
              })
              .map((link) => {
                let href = link.href;

                // If it's a project-specific link, prepend project ID
                if (projectId && projectId.trim() !== '' && !link.href.startsWith('/')) {
                  href = `/projects/${projectId}/${link.href}`.replace(/\/$/, '');
                }

                let isActive = false;

                // Special logic for sprints
                if (link.name === 'Active Sprint' && activeSprint) {
                  href = `/projects/${projectId}/sprints/${activeSprint.id}`;
                  isActive = Boolean(isOnActiveSprint);
                } else if (link.name === 'All Sprints') {
                  href = `/projects/${projectId}/sprints`;
                  isActive = Boolean(isOnAllSprints);
                } else {
                  isActive = pathname === href;
                }

                const Icon = link.icon;

                // Show badge only if there is an active sprint
                const showActiveSprintBadge = link.name === 'Active Sprint' && !!activeSprint;

                return (
                  <li key={link.name}>
                    <Tooltip label={isCollapsed ? link.name : ''}>
                      <Link
                        href={href}
                        onMouseEnter={() => handlePrefetch(link.name)}
                        className={`group flex items-center w-full ${isCollapsed ? 'justify-center px-2 py-3' : 'justify-start px-3 py-2'} rounded-lg transition-all duration-200 relative
                          ${isActive
                            ? 'bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-400 font-semibold shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                            : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-neutral-200'
                          }`
                        }
                      >
                        {/* Icon - larger when collapsed */}
                        <Icon className={`shrink-0 transition-all duration-200 ${isCollapsed ? 'h-6 w-6' : 'h-5 w-5'} ${isActive
                          ? 'text-primary-600 dark:text-primary-400'
                          : 'text-neutral-500 group-hover:text-neutral-700 dark:group-hover:text-neutral-300'
                          }`} />

                        {!isCollapsed && (
                          <Typography variant="body-sm" className={`ml-3 truncate ${isActive ? 'font-semibold' : 'font-medium'}`}>
                            {link.name}
                          </Typography>
                        )}

                        {/* Active Sprint Badge */}
                        {showActiveSprintBadge && !isCollapsed && (
                          <span className="ml-auto inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-success-100 text-success-800 dark:bg-success-900 dark:text-success-200">
                            Active
                          </span>
                        )}

                        {/* Dot for collapsed active state */}
                        {showActiveSprintBadge && isCollapsed && (
                          <span className="absolute top-1 right-1 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-success-500"></span>
                          </span>
                        )}
                      </Link>
                    </Tooltip>
                  </li>
                );
              })}
          </ul>
        </nav>
      ) : null}

      {/* Collapse Toggle Footer */}
      <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
        <Button
          variant="ghost"
          fullWidth
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`group flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-start px-3'}`}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <div className={`flex items-center justify-center transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''} ${!isCollapsed ? 'mr-3' : ''}`}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-neutral-500 group-hover:text-neutral-900 dark:group-hover:text-neutral-200">
              <path fillRule="evenodd" d="M15.28 9.47a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 1 1-1.06-1.06L13.69 10 9.97 6.28a.75.75 0 0 1 1.06-1.06l4.25 4.25ZM6.03 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.69 10 6.03 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </div>
          {!isCollapsed && <span className="text-sm font-medium text-neutral-500 group-hover:text-neutral-900 dark:group-hover:text-neutral-200">Collapse Sidebar</span>}
        </Button>
      </div>

      {/* Create Issue Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Card variant="elevated" className="w-full max-w-md p-6">
            <Typography variant="h4" className="mb-4">
              Create Issue
            </Typography>
            {/* Placeholder for create issue form */}
            <Typography variant="body" color="muted" className="mb-6">
              (Create Issue form goes here)
            </Typography>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button onClick={() => setShowCreateModal(false)}>
                Create
              </Button>
            </div>
          </Card>
        </div>
      )}
    </aside>
  );
};

export default Sidebar; 