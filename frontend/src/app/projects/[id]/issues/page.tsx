"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject, useProjectMembers } from "../../../../hooks/useProject";
import { useSprints } from "../../../../hooks/useSprints";
import { useProjectIssues, Issue, Label } from "../../../../hooks/useProjectIssues";
import Spinner from "../../../../components/Spinner";
import Button from "../../../../components/Button";
import Input from "../../../../components/Input";
import { apiFetch } from '../../../../lib/fetcher';
import { UserCircleIcon, PlusIcon, MagnifyingGlassIcon, PencilSquareIcon, EyeIcon, FunnelIcon } from '@heroicons/react/24/outline';
import CreateIssueModal from '../../../../components/CreateIssueModal';
import { TagIcon as TagSolidIcon } from '@heroicons/react/24/solid';

// Placeholder for fetching labels (implement as needed)
const useLabels = (projectId: string) => {
  const [labels, setLabels] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    apiFetch(`/projects/${projectId}/labels`)
      .then(data => setLabels(Array.isArray(data) ? data : []))
      .catch(() => console.error("Error fetching labels"))
      .finally(() => setLoading(false));
  }, [projectId]);
  return { labels, loading };
};

function getStatusColor(status: string) {
  switch (status) {
    case 'To Do': return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200';
    case 'In Progress': return 'bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-blue-200';
    case 'Done': return 'bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-200';
    default: return 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300';
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'Highest': return 'bg-red-100 text-red-700 dark:bg-red-700 dark:text-red-200';
    case 'High': return 'bg-orange-100 text-orange-700 dark:bg-orange-700 dark:text-orange-200';
    case 'Medium': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-700 dark:text-yellow-200';
    case 'Low': return 'bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-200';
    default: return 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300';
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'Bug': return <TagSolidIcon className="h-4 w-4 text-red-500" title="Bug" />;
    case 'Story': return <TagSolidIcon className="h-4 w-4 text-green-500" title="Story" />;
    case 'Task': return <TagSolidIcon className="h-4 w-4 text-blue-500" title="Task" />;
    case 'Epic': return <TagSolidIcon className="h-4 w-4 text-purple-500" title="Epic" />;
    default: return <TagSolidIcon className="h-4 w-4 text-neutral-400" title={type} />;
  }
}

function getAvatar(name: string | undefined) {
  if (!name) return <UserCircleIcon className="h-8 w-8 text-neutral-300 dark:text-neutral-700" />;
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2);
  return <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-500 text-white font-medium text-sm">{initials}</span>;
}

function getAssigneeDisplayName(issue: Issue) {
  // Debug logging
  console.log('Issue assignee data:', {
    assignee: issue.assignee,
    assigneeId: issue.assigneeId,
    assigneeType: typeof issue.assignee
  });
  
  if (issue.assignee && typeof issue.assignee === 'object' && issue.assignee.name) {
    return issue.assignee.name;
  } else if (issue.assigneeId) {
    // If we have assigneeId but no assignee object, show the ID temporarily
    return `User ${issue.assigneeId.slice(0, 8)}...`;
  } else {
    return 'Unassigned';
  }
}

function getAssigneeAvatar(issue: Issue) {
  if (issue.assignee && typeof issue.assignee === 'object' && issue.assignee.name) {
    return getAvatar(issue.assignee.name);
  }
  return getAvatar(undefined);
}

export default function IssuesListPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { project } = useProject(projectId);
  const { data: members, isLoading: loadingMembers } = useProjectMembers(projectId);
  const { sprints, isLoading: loadingSprints } = useSprints(projectId);
  const { } = useLabels(projectId);
  const router = useRouter();

  // Filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [label, setLabel] = useState("");
  const [sprint, setSprint] = useState("");
  const [sort, setSort] = useState("updatedAt");
  const [showFilters, setShowFilters] = useState(false);

  // Issues fetching via React Query hook
  const { issues, isLoading, isError } = useProjectIssues(projectId, {
    search,
    status,
    assigneeId,
    label,
    sprint,
    sort,
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editIssue, setEditIssue] = useState<Issue | null>(null);

  // Clear all filters
  const clearFilters = () => {
    setSearch("");
    setStatus("");
    setAssigneeId("");
    setLabel("");
    setSprint("");
    setSort("updatedAt");
  };

  // Check if any filters are active
  const hasActiveFilters = search || status || assigneeId || label || sprint || sort !== "updatedAt";

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      {/* Header */}
      <div className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
                  Issues
                </h1>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                  {project?.name} • {issues?.length || 0} issues
                </p>
              </div>
        </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2"
              >
                <FunnelIcon className="h-4 w-4" />
                Filters
                {hasActiveFilters && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-blue-500 text-white rounded-full">
                    {[search, status, assigneeId, label, sprint].filter(Boolean).length + (sort !== "updatedAt" ? 1 : 0)}
                  </span>
                )}
              </Button>
              <Button
                variant="primary"
            onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2"
          >
                <PlusIcon className="h-4 w-4" />
            Create Issue
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters Section */}
      {showFilters && (
        <div className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              {/* Search */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Search
                </label>
        <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search issues..."
                    className="pl-10"
          />
        </div>
              </div>

        {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Status
                </label>
                <select
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                >
                  <option value="">All Status</option>
                  <option value="To Do">To Do</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Done">Done</option>
                </select>
          </div>

        {/* Assignee Filter */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Assignee
                </label>
            <select
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={assigneeId}
              onChange={e => setAssigneeId(e.target.value)}
              disabled={loadingMembers}
            >
                  <option value="">All Assignees</option>
              {members && members.map(m => (
                    <option key={m.userId} value={m.userId}>
                      {m.user?.name || m.user?.email || m.userId}
                    </option>
              ))}
            </select>
          </div>

        {/* Sprint Filter */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Sprint
                </label>
            <select
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={sprint}
              onChange={e => setSprint(e.target.value)}
              disabled={loadingSprints}
            >
                  <option value="">All Sprints</option>
              {sprints && sprints.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

              {/* Sort */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Sort By
                </label>
            <select
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={sort}
              onChange={e => setSort(e.target.value)}
            >
              <option value="updatedAt">Last Updated</option>
              <option value="priority">Priority</option>
                  <option value="createdAt">Created Date</option>
                  <option value="title">Title</option>
            </select>
          </div>
      </div>

            {/* Filter Actions */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <div className="text-sm text-neutral-500 dark:text-neutral-400">
                {issues?.length || 0} issues found
              </div>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={clearFilters}
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Issue Modal */}
      <CreateIssueModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        projectId={projectId}
      />

      {/* Edit Issue Modal */}
      {editIssue && (
        <CreateIssueModal
          isOpen={!!editIssue}
          onClose={() => setEditIssue(null)}
          projectId={projectId}
          issue={editIssue}
          mode="edit"
        />
      )}

      {/* Issues List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner className="h-8 w-8" />
          </div>
        ) : isError ? (
          <div className="text-center py-12">
            <div className="text-red-500 text-lg font-medium mb-2">Failed to load issues</div>
            <div className="text-neutral-500 dark:text-neutral-400">Please try refreshing the page</div>
          </div>
        ) : issues?.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-24 h-24 mx-auto mb-6 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center">
              <TagSolidIcon className="h-12 w-12 text-neutral-400" />
            </div>
            <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-2">
              No issues found
            </h3>
            <p className="text-neutral-500 dark:text-neutral-400 mb-6">
              {hasActiveFilters 
                ? "Try adjusting your filters to see more results"
                : "Get started by creating your first issue"
              }
            </p>
            {!hasActiveFilters && (
              <Button
                variant="primary"
        onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 mx-auto"
              >
                <PlusIcon className="h-4 w-4" />
                Create Issue
              </Button>
            )}
              </div>
            ) : (
          <div className="space-y-4">
            {issues?.map(issue => (
                <div
                  key={issue.id}
                className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 group"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    {/* Issue Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-4">
                        {/* Issue Key and Type */}
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-sm font-mono text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-700 px-2 py-1 rounded">
                            {issue.key}
                          </span>
                          <div className="flex items-center gap-1">
                            {getTypeIcon(issue.type)}
                            <span className="text-xs text-neutral-500 dark:text-neutral-400">
                              {issue.type}
                            </span>
                          </div>
                        </div>

                        {/* Issue Details */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors cursor-pointer" onClick={() => router.push(`/projects/${projectId}/issues/${issue.id}`)}>
                            {issue.title}
                          </h3>
                          
                          {/* Badges */}
                          <div className="flex flex-wrap gap-2 items-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(issue.status)}`}>
                              {issue.status}
                            </span>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(issue.priority)}`}>
                              {issue.priority}
                            </span>
                            {issue.storyPoints && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-700 dark:text-purple-200">
                                {issue.storyPoints} pts
                              </span>
                            )}
                        {issue.labels && Array.isArray(issue.labels) && issue.labels.map((l: Label) => (
                              <span key={l.id} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-blue-200">
                                {l.name}
                              </span>
                        ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Side - Assignee, Dates, Actions */}
                    <div className="flex flex-col items-end gap-4 ml-6">
                      {/* Assignee */}
                        <div className="flex items-center gap-2">
                        {getAssigneeAvatar(issue)}
                        <div className="text-right">
                          <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            {getAssigneeDisplayName(issue)}
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">
                            Updated {issue.updatedAt ? new Date(issue.updatedAt).toLocaleDateString() : '-'}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditIssue(issue);
                          }}
                          className="flex items-center gap-1"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/projects/${projectId}/issues/${issue.id}`);
                          }}
                          className="flex items-center gap-1"
                        >
                          <EyeIcon className="h-4 w-4" />
                          View
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 