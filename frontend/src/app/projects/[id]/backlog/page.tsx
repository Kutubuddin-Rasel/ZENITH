"use client";
import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { useBacklog } from '@/hooks/useBacklog';
import { useProject } from '@/hooks/useProject';
import { useToast } from '@/context/ToastContext';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Spinner from '@/components/Spinner';
import Typography from '@/components/Typography';
import CreateIssueModal from '@/components/CreateIssueModal';
import { useUpdateIssueStatus } from '@/hooks/useUpdateIssueStatus';
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Bars3Icon, PencilSquareIcon, TrashIcon, ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import Tooltip from '@/components/Tooltip';
import type { DropResult } from '@hello-pangea/dnd';

export default function BacklogPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { issues: backlogIssues, isLoading, isError } = useBacklog(projectId);
  const { currentUserRole } = useProject(projectId);
  const { showToast } = useToast();
  const updateIssueStatus = useUpdateIssueStatus(projectId);

  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [orderedIssues, setOrderedIssues] = useState(backlogIssues || []);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Get unique values for filters
  const statuses = Array.from(new Set((backlogIssues || []).map(issue => (issue.status || '').trim()).filter(Boolean)));
  const priorities = Array.from(new Set((backlogIssues || []).map(issue => (issue.priority || '').trim()).filter(Boolean)));
  const assignees = Array.from(new Set((backlogIssues || []).map(issue =>
    typeof issue.assignee === 'string' ? issue.assignee : issue.assignee?.name
  ).filter(Boolean)));
  const hasNoStatus = (backlogIssues || []).some(issue => !issue.status);
  const hasNoPriority = (backlogIssues || []).some(issue => !issue.priority);

  // Filter issues
  const filteredIssues = backlogIssues?.filter((issue) => {
    const matchesFilter = issue.title.toLowerCase().includes(filter.toLowerCase()) ||
                         issue.description?.toLowerCase().includes(filter.toLowerCase());
    const matchesStatus = !statusFilter || (issue.status ? issue.status.trim() : '') === statusFilter;
    const matchesPriority = !priorityFilter || (issue.priority ? issue.priority.trim() : '') === priorityFilter;
    const matchesAssignee = !assigneeFilter || 
      (typeof issue.assignee === 'string'
        ? issue.assignee === assigneeFilter
        : issue.assignee?.name === assigneeFilter);
    return matchesFilter && matchesStatus && matchesPriority && matchesAssignee;
  }) || [];

  React.useEffect(() => {
    setOrderedIssues(filteredIssues);
  }, [JSON.stringify(filteredIssues)]);

  const handleSelectAll = () => {
    if (selectedIssues.size === filteredIssues.length) {
      setSelectedIssues(new Set());
    } else {
      setSelectedIssues(new Set(filteredIssues.map(issue => issue.id)));
    }
  };

  const handleSelectIssue = (issueId: string) => {
    const newSelected = new Set(selectedIssues);
    if (newSelected.has(issueId)) {
      newSelected.delete(issueId);
    } else {
      newSelected.add(issueId);
    }
    setSelectedIssues(newSelected);
  };

  const handleBulkUpdate = (status: string) => {
    Array.from(selectedIssues).forEach(issueId => {
      updateIssueStatus.mutate({ issueId, status });
    });
    setSelectedIssues(new Set());
    showToast('Issues updated successfully', 'success');
  };

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const newOrder = Array.from(orderedIssues);
    const [removed] = newOrder.splice(result.source.index, 1);
    newOrder.splice(result.destination.index, 0, removed);
    setOrderedIssues(newOrder);
    // TODO: Persist new order to backend
  }

  const canCreateIssue = ["Super-Admin", "ProjectLead", "Developer", "QA"].includes(currentUserRole ?? "");

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  
  if (isError) {
    return (
      <Card className="text-center p-8">
        <Typography variant="h3" className="text-red-600 dark:text-red-400">
          Failed to load backlog.
        </Typography>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Typography variant="h1" className="text-gray-900 dark:text-white">
          Backlog
        </Typography>
        {canCreateIssue && (
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Issue
          </Button>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedIssues.size > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <Typography variant="body" className="font-semibold text-primary-600 dark:text-primary-400">
              {selectedIssues.size} issue{selectedIssues.size > 1 ? 's' : ''} selected
            </Typography>
            <div className="flex items-center gap-2">
              <Typography variant="body-sm" className="text-gray-600 dark:text-gray-400">
                Change status to:
              </Typography>
              <select
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 text-sm"
                onChange={(e) => handleBulkUpdate(e.target.value)}
                defaultValue=""
              >
                <option value="" disabled>Select status...</option>
                <option value="Backlog">Backlog</option>
                <option value="To Do">To Do</option>
                <option value="Selected for Development">Selected for Development</option>
                <option value="In Progress">In Progress</option>
                <option value="In Review">In Review</option>
                <option value="Blocked">Blocked</option>
                <option value="Ready for QA">Ready for QA</option>
                <option value="Testing">Testing</option>
                <option value="Done">Done</option>
                <option value="Closed">Closed</option>
                <option value="Reopened">Reopened</option>
                <option value="On Hold">On Hold</option>
              </select>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setSelectedIssues(new Set())}>
              Clear Selection
            </Button>
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <Input
              placeholder="Search issues..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-10"
            />
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          </div>
          <select
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {statuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
            {hasNoStatus && <option value="">No Status</option>}
          </select>
          <select
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="">All Priorities</option>
            {priorities.map(priority => (
              <option key={priority} value={priority}>{priority}</option>
            ))}
            {hasNoPriority && <option value="">No Priority</option>}
          </select>
          <select
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="">All Assignees</option>
            {assignees.map(assignee => (
              <option key={assignee} value={assignee}>{assignee}</option>
            ))}
          </select>
        </div>
      </Card>

      {/* Issues Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="backlog-table">
              {(provided) => (
                <table
                  className="w-full min-w-[900px]"
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                >
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                      <th className="text-left p-4 w-12"></th>
                      <th className="text-left p-4 w-12">
                        <input
                          type="checkbox"
                          checked={selectedIssues.size === orderedIssues.length && orderedIssues.length > 0}
                          onChange={handleSelectAll}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </th>
                      <th className="text-left p-4 font-semibold text-gray-900 dark:text-white">Key</th>
                      <th className="text-left p-4 font-semibold text-gray-900 dark:text-white">Title</th>
                      <th className="text-left p-4 font-semibold text-gray-900 dark:text-white">Status</th>
                      <th className="text-left p-4 font-semibold text-gray-900 dark:text-white">Priority</th>
                      <th className="text-left p-4 font-semibold text-gray-900 dark:text-white">Assignee</th>
                      <th className="text-left p-4 font-semibold text-gray-900 dark:text-white">Story Points</th>
                      <th className="text-left p-4 font-semibold text-gray-900 dark:text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIssues.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-16">
                          <div className="flex flex-col items-center justify-center">
                            <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center mb-4">
                              <PlusIcon className="h-12 w-12 text-gray-400" />
                            </div>
                            <Typography variant="h3" className="text-gray-500 dark:text-gray-400 mb-4">
                              No backlog issues yet
                            </Typography>
                            {canCreateIssue && (
                              <Button onClick={() => setIsCreateModalOpen(true)}>
                                <PlusIcon className="h-5 w-5 mr-2" />
                                Create your first issue
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      orderedIssues.map((issue, idx) => (
                        <Draggable key={issue.id} draggableId={issue.id} index={idx}>
                          {(provided, snapshot) => (
                            <tr
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-200 ${
                                snapshot.isDragging ? 'bg-white dark:bg-gray-800 shadow-lg' : ''
                              }`}
                              style={provided.draggableProps.style}
                            >
                              <td className="p-4 cursor-grab" {...provided.dragHandleProps}>
                                <Tooltip label="Drag to reorder">
                                  <Bars3Icon className="h-5 w-5 text-gray-400" />
                                </Tooltip>
                              </td>
                              <td className="p-4">
                                <input
                                  type="checkbox"
                                  checked={selectedIssues.has(issue.id)}
                                  onChange={() => handleSelectIssue(issue.id)}
                                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                />
                              </td>
                              <td className="p-4">
                                <Typography variant="body-sm" className="font-mono text-primary-600 dark:text-primary-400 font-semibold">
                                  {issue.key}
                                </Typography>
                              </td>
                              <td className="p-4">
                                <a 
                                  href={`/projects/${projectId}/issues/${issue.id}`} 
                                  className="text-primary-600 dark:text-primary-400 font-semibold hover:underline transition-colors"
                                >
                                  {issue.title}
                                </a>
                                {issue.description && (
                                  <Typography variant="body-sm" className="text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                    {issue.description}
                                  </Typography>
                                )}
                              </td>
                              <td className="p-4">
                                <span
                                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                    issue.status === 'Done' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                    issue.status === 'In Progress' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                    issue.status === 'To Do' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                    issue.status === 'Backlog' ? 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200' :
                                    issue.status === 'Blocked' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                    'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                  }`}
                                >
                                  {issue.status}
                                </span>
                              </td>
                              <td className="p-4">
                                {issue.priority && (
                                  <span
                                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                      issue.priority === 'Highest' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                      issue.priority === 'High' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                      issue.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                      issue.priority === 'Low' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                      issue.priority === 'Lowest' ? 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200' :
                                      'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                    }`}
                                  >
                                    {issue.priority}
                                  </span>
                                )}
                              </td>
                              <td className="p-4">
                                {issue.assignee ? (
                                  typeof issue.assignee === 'string' ? (
                                    <div className="flex items-center gap-2">
                                      <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center">
                                        <Typography variant="body-sm" className="text-primary-600 dark:text-primary-400 font-semibold">
                                          {issue.assignee[0]}
                                        </Typography>
                                      </div>
                                      <Typography variant="body" className="text-gray-900 dark:text-white">
                                        {issue.assignee}
                                      </Typography>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      {issue.assignee.avatarUrl ? (
                                        <img 
                                          src={issue.assignee.avatarUrl} 
                                          alt={issue.assignee.name || '?'} 
                                          className="w-8 h-8 rounded-full object-cover" 
                                        />
                                      ) : (
                                        <div className="w-8 h-8 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center">
                                          <Typography variant="body-sm" className="text-primary-600 dark:text-primary-400 font-semibold">
                                            {issue.assignee.name ? issue.assignee.name[0] : '?'}
                                          </Typography>
                                        </div>
                                      )}
                                      <Typography variant="body" className="text-gray-900 dark:text-white">
                                        {issue.assignee.name || '?'}
                                      </Typography>
                                    </div>
                                  )
                                ) : (
                                  <Typography variant="body" className="text-gray-400 italic">
                                    Unassigned
                                  </Typography>
                                )}
                              </td>
                              <td className="p-4">
                                <Typography variant="body" className="text-center font-semibold text-gray-900 dark:text-white">
                                  {issue.storyPoints ?? '-'}
                                </Typography>
                              </td>
                              <td className="p-4 w-32">
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Tooltip label="Edit Issue">
                                    <button
                                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                      aria-label="Edit Issue"
                                      onClick={() => alert('Edit Issue')}
                                    >
                                      <PencilSquareIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                    </button>
                                  </Tooltip>
                                  <Tooltip label="Delete Issue">
                                    <button
                                      className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900 transition-colors"
                                      aria-label="Delete Issue"
                                      onClick={() => alert('Delete Issue')}
                                    >
                                      <TrashIcon className="h-5 w-5 text-red-500" />
                                    </button>
                                  </Tooltip>
                                  <Tooltip label="Move Issue">
                                    <button
                                      className="p-2 rounded-lg hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
                                      aria-label="Move Issue"
                                      onClick={() => alert('Move Issue')}
                                    >
                                      <ArrowRightCircleIcon className="h-5 w-5 text-green-600" />
                                    </button>
                                  </Tooltip>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Draggable>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </Card>

      {/* Mobile FAB */}
      {canCreateIssue && (
        <button
          className="fixed bottom-6 right-6 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-primary-600 text-white shadow-lg hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 md:hidden"
          onClick={() => setIsCreateModalOpen(true)}
          aria-label="Add Issue"
        >
          <PlusIcon className="h-6 w-6" />
        </button>
      )}

      {/* Create Issue Modal */}
      {isCreateModalOpen && (
        <CreateIssueModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          projectId={projectId}
        />
      )}
    </div>
  );
} 