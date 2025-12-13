import React, { useState } from 'react';
import { LinkIcon, TrashIcon, ArrowLongRightIcon, LockClosedIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import Button from '../Button';
import Spinner from '../Spinner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/fetcher';
import { Issue } from '../../hooks/useProjectIssues';

// Types (should match backend)
export enum LinkType {
    BLOCKS = 'BLOCKS',
    IS_BLOCKED_BY = 'IS_BLOCKED_BY',
    RELATES_TO = 'RELATES_TO',
    DUPLICATES = 'DUPLICATES',
}

interface IssueLink {
    id: string;
    sourceIssueId: string;
    targetIssueId: string;
    type: LinkType;
    sourceIssue: { id: string; title: string; status: string; key: string };
    targetIssue: { id: string; title: string; status: string; key: string };
}

interface LinkedIssuesProps {
    projectId: string;
    issueId: string;
}

export default function LinkedIssues({ projectId, issueId }: LinkedIssuesProps) {
    const queryClient = useQueryClient();
    const [isAdding, setIsAdding] = useState(false);
    const [targetIssueId, setTargetIssueId] = useState('');
    const [linkType, setLinkType] = useState<LinkType>(LinkType.RELATES_TO);
    const [searchQuery, setSearchQuery] = useState('');

    // Fetch Links
    const { data: links, isLoading } = useQuery<IssueLink[]>({
        queryKey: ['issue-links', issueId],
        queryFn: () => apiFetch(`/projects/${projectId}/issues/${issueId}/links`),
        enabled: !!issueId,
    });

    // Search Issues (mock search for now, ideally backend search endpoint)
    const { data: searchResults, isLoading: isSearching } = useQuery<Issue[]>({
        queryKey: ['issues-search', projectId, searchQuery],
        queryFn: () => apiFetch(`/projects/${projectId}/issues?search=${searchQuery}`),
        enabled: searchQuery.length > 2,
    });

    // Add Link Mutation
    const addLink = useMutation({
        mutationFn: async (data: { targetIssueId: string; type: LinkType }) => {
            return apiFetch(`/projects/${projectId}/issues/${issueId}/links`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['issue-links', issueId] });
            setIsAdding(false);
            setTargetIssueId('');
            setSearchQuery('');
        },
    });

    // Remove Link Mutation
    const removeLink = useMutation({
        mutationFn: async (linkId: string) => {
            return apiFetch(`/projects/${projectId}/issues/${issueId}/links/${linkId}`, {
                method: 'DELETE',
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['issue-links', issueId] });
        },
    });

    const getLinkIcon = (type: LinkType) => {
        switch (type) {
            case LinkType.BLOCKS: return <LockClosedIcon className="h-4 w-4 text-error-500" />;
            case LinkType.IS_BLOCKED_BY: return <LockClosedIcon className="h-4 w-4 text-warning-500" />;
            case LinkType.DUPLICATES: return <DocumentDuplicateIcon className="h-4 w-4 text-neutral-400" />;
            default: return <ArrowLongRightIcon className="h-4 w-4 text-primary-500" />;
        }
    };

    const renderLinkItem = (link: IssueLink) => {
        const isSource = link.sourceIssueId === issueId;
        const otherIssue = isSource ? link.targetIssue : link.sourceIssue;

        // Determine semantic phrasing
        let phrase = '';
        if (link.type === LinkType.RELATES_TO) phrase = 'relates to';
        else if (link.type === LinkType.DUPLICATES) phrase = 'duplicates';
        else if (link.type === LinkType.BLOCKS) {
            phrase = isSource ? 'blocks' : 'is blocked by';
        } else if (link.type === LinkType.IS_BLOCKED_BY) {
            phrase = isSource ? 'is blocked by' : 'blocks';
        }

        return (
            <div key={link.id} className="flex items-center justify-between p-2 hover:bg-white dark:hover:bg-neutral-800/50 rounded-lg group transition-all border border-transparent hover:border-primary-100 dark:hover:border-primary-900/30 hover:shadow-sm">
                <div className="flex items-center gap-3 overflow-hidden">
                    {getLinkIcon(link.type)}
                    <div className="flex flex-col min-w-0">
                        <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">{phrase}</span>
                        <a href={`/projects/${projectId}/issues/${otherIssue.id}`} className="text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:text-primary-600 dark:hover:text-primary-400 truncate block transition-colors">
                            {otherIssue.title}
                        </a>
                    </div>
                </div>
                <button
                    onClick={() => removeLink.mutate(link.id)}
                    disabled={removeLink.status === 'pending'}
                    className="text-neutral-400 hover:text-error-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                >
                    <TrashIcon className="h-4 w-4" />
                </button>
            </div>
        );
    };

    return (
        <div className="space-y-3">
            {/* List */}
            <div className="space-y-1">
                {isLoading ? (
                    <div className="py-2"><Spinner className="h-4 w-4 mx-auto text-primary-500" /></div>
                ) : links && links.length > 0 ? (
                    links.map(renderLinkItem)
                ) : (
                    <p className="text-sm text-neutral-400 italic px-2">No linked issues.</p>
                )}
            </div>

            {/* Add Actions */}
            {!isAdding ? (
                <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-start text-xs text-neutral-500 hover:text-primary-600 pl-2"
                    onClick={() => setIsAdding(true)}
                >
                    <LinkIcon className="h-3 w-3 mr-2" /> Link an issue
                </Button>
            ) : (
                <div className="bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 animate-scale-in shadow-lg relative z-10">
                    <div className="space-y-3">
                        <div>
                            <label className="block text-[10px] uppercase tracking-wide text-neutral-500 font-semibold mb-1">Relationship</label>
                            <select
                                className="w-full text-xs p-2 rounded-md border bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
                                value={linkType}
                                onChange={e => setLinkType(e.target.value as LinkType)}
                            >
                                <option value={LinkType.RELATES_TO}>Relates to</option>
                                <option value={LinkType.BLOCKS}>Blocks</option>
                                <option value={LinkType.IS_BLOCKED_BY}>Is blocked by</option>
                                <option value={LinkType.DUPLICATES}>Duplicates</option>
                            </select>
                        </div>

                        <div className="relative">
                            <label className="block text-[10px] uppercase tracking-wide text-neutral-500 font-semibold mb-1">Target Issue</label>
                            <input
                                type="text"
                                className="w-full text-xs p-2 rounded-md border bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all placeholder:text-neutral-400"
                                placeholder="Search by title or key..."
                                value={searchQuery}
                                onChange={e => {
                                    setSearchQuery(e.target.value);
                                    if (targetIssueId) setTargetIssueId(''); // Clear selection on edit
                                }}
                                autoFocus
                            />
                            {/* Search Results Dropdown */}
                            {searchQuery.length > 2 && !targetIssueId && searchResults && (
                                <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-xl rounded-md z-50">
                                    {isSearching ? (
                                        <div className="p-3 text-center text-neutral-400 text-xs">Searching...</div>
                                    ) : searchResults && searchResults.length > 0 ? (
                                        searchResults.filter((i) => i.id !== issueId).map((res) => (
                                            <div
                                                key={res.id}
                                                className="px-3 py-2 text-xs hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer border-b border-neutral-100 dark:border-neutral-800 last:border-0 transition-colors flex justify-between items-center group"
                                                onClick={() => {
                                                    setTargetIssueId(res.id);
                                                    setSearchQuery(res.title); // Auto-fill title
                                                }}
                                            >
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-neutral-900 dark:text-neutral-100">{res.title}</span>
                                                    <span className="text-[10px] text-neutral-500">{res.key} • {res.status}</span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-3 text-center text-neutral-400 text-xs">No matches found.</div>
                                    )}
                                </div>
                            )}
                            {targetIssueId && (
                                <div className="absolute right-2 top-8 text-xs text-primary-600 font-medium bg-primary-50 px-2 py-0.5 rounded pointer-events-none">
                                    Selected
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2 justify-end pt-1">
                            <Button size="xs" variant="ghost" onClick={() => setIsAdding(false)} className="text-neutral-500">Cancel</Button>
                            <Button
                                size="xs"
                                disabled={!targetIssueId || addLink.status === 'pending'}
                                onClick={() => addLink.mutate({ targetIssueId, type: linkType })}
                                className="bg-primary-600 hover:bg-primary-700 text-white"
                            >
                                {addLink.status === 'pending' ? 'Adding...' : 'Add Link'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
