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
  ChartBarIcon,
  Cog6ToothIcon,
  ExclamationCircleIcon,
  PaperClipIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import Button from './Button';
import { useProjectRole, useRole } from '../context/RoleContext';
import { useActiveSprint } from '../hooks/useSprints';
import Typography from './Typography';
import Card from './Card';

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
    name: 'Epics', 
    href: 'epics', 
    icon: ExclamationCircleIcon, 
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
    name: 'Reports', 
    href: 'reports', 
    icon: ChartBarIcon, 
    roles: ['Super-Admin', 'ProjectLead'] // Only Super-Admin & ProjectLead
  },
  { 
    name: 'Team', 
    href: 'team', 
    icon: UserGroupIcon, 
    roles: ['Super-Admin', 'ProjectLead'] // Only Super-Admin & ProjectLead
  },
  { 
    name: 'Manage Employees', 
    href: '/manageemployees', 
    icon: UserGroupIcon, 
    roles: ['Super-Admin'] // Only Super-Admin
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

  // Always use 'Super-Admin' for effectiveRole if isSuperAdmin is true
  const effectiveRole = isSuperAdmin ? 'Super-Admin' : projectRole;


  // Fetch active sprint for badge and link
  const { activeSprint } = useActiveSprint(projectId || '');

  // Determine current route for highlighting
  const isOnAllSprints = pathname === `/projects/${projectId}/sprints`;
  const isOnActiveSprint = activeSprint && pathname === `/projects/${projectId}/sprints/${activeSprint.id}`;

  return (
    <aside className="w-64 h-screen flex flex-col bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 shadow-sm">
      {/* Header section */}
      <div className="p-6 border-b border-neutral-200 dark:border-neutral-800">
        <Link 
          href="/projects" 
          className="flex items-center justify-center hover:opacity-80 transition-opacity duration-200 group"
        >
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow duration-200">
            <span className="text-white font-semibold text-sm">Z</span>
          </div>
          <Typography variant="h5" className="ml-3 text-primary-600 dark:text-primary-400 font-bold hidden sm:block">
            Zenith
          </Typography>
        </Link>
      </div>

      {/* Navigation - Only show when a project is selected */}
      {projectId && projectId.trim() !== '' && effectiveRole && (
        <nav className="flex-1 py-6 px-3">
          <ul className="space-y-1">
            {sidebarItems
              .filter(item => {
                // Check role access
                if (!item.roles.includes(effectiveRole)) {
                  return false;
                }
                
                // Check conditional visibility
                if (item.conditional === 'activeSprint') {
                  return !!activeSprint; // Only show Active Sprint if there is an active sprint
                }
                
                return true;
              })
              .map((link) => {
                let href = link.href.startsWith('/') ? link.href : `/projects/${projectId}/${link.href}`.replace(/\/$/, '');
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
                    <Link
                      href={href}
                      className={`group flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 relative
                        ${isActive
                          ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 border-r-2 border-primary-600'
                          : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100'
                        }`
                      }
                    >
                      <Icon className={`h-5 w-5 transition-colors duration-200 ${
                        isActive 
                          ? 'text-primary-600 dark:text-primary-400' 
                          : 'text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300'
                      }`} />
                      
                      <Typography variant="body-sm" className="font-medium">
                        {link.name}
                      </Typography>
                      
                      {/* Active Sprint Badge */}
                      {showActiveSprintBadge && (
                        <span className="ml-auto inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-success-100 text-success-800 dark:bg-success-900 dark:text-success-200">
                          Active
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </nav>
      )}

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