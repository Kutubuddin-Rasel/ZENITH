import React, { useState } from 'react';
import { useProjectIssues } from '../hooks/useProjectIssues';
import Button from './Button';
import Input from './Input';
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface ProjectIssueSidebarProps {
  projectId: string;
}

const ProjectIssueSidebar: React.FC<ProjectIssueSidebarProps> = ({ projectId }) => {
  const { issues, isLoading, isError } = useProjectIssues(projectId);
  const [search, setSearch] = useState('');

  // Filter issues by search
  const filteredIssues = (issues || []).filter(
    (issue) =>
      issue.title.toLowerCase().includes(search.toLowerCase()) ||
      issue.key.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside className="w-80 max-w-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 h-full flex flex-col shadow-md">
      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search issues..."
            className="pl-8 pr-2 py-2 text-sm"
            aria-label="Search issues"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-gray-400">Loading...</div>
        ) : isError ? (
          <div className="p-4 text-center text-red-500">Failed to load issues.</div>
        ) : filteredIssues.length === 0 ? (
          <div className="p-4 text-center text-gray-400">No issues found.</div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {filteredIssues.map(issue => (
              <li key={issue.id} className="p-3 hover:bg-blue-50 dark:hover:bg-blue-950/10 cursor-pointer flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-accent-blue text-xs">{issue.key}</span>
                  <span className="font-medium truncate flex-1 text-sm">{issue.title}</span>
                </div>
                <div className="flex gap-2 mt-1 text-xs items-center">
                  <span className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-300">{issue.status}</span>
                  {issue.priority && <span className="px-2 py-0.5 rounded bg-accent-blue/10 text-accent-blue font-semibold">{issue.priority}</span>}
                  {issue.assignee && (
                    <span className="ml-auto px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300">
                      {typeof issue.assignee === 'string' ? issue.assignee : (issue.assignee.name || 'Unassigned')}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
};

export default ProjectIssueSidebar; 