import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/fetcher";
import { getSocket } from "../lib/socket";
import { Issue } from "./useProjectIssues";

export function useReorderBoardIssues(projectId: string, boardId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['project-issues', projectId];

  return useMutation({
    mutationFn: async ({
      columnId,
      orderedIssueIds,
    }: {
      columnId: string;
      orderedIssueIds: string[];
    }) => {
      const socket = getSocket();
      if (socket) {
        // Socket provides real-time broadcast, but for the sender, we rely on optimistic update.
        socket.emit("reorder-issue", { projectId, boardId, columnId, orderedIssueIds });
        return { message: "Issue reorder event sent." };
      }
      return apiFetch(`/projects/${projectId}/boards/${boardId}/issues/reorder`, {
        method: "POST",
        body: JSON.stringify({ columnId, orderedIssueIds }),
      });
    },
    onMutate: async ({ orderedIssueIds }) => {
      // 1. Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey });

      // 2. Snapshot the previous value
      const previousIssues = queryClient.getQueryData<Issue[]>(queryKey);

      // 3. Optimistically update to the new value
      if (previousIssues) {
        // Identify issues that are NOT in the reordered list (belonging to other columns)
        // Note: This logic assumes 'orderedIssueIds' contains ALL IDs for that column.
        // If it's partial, this breaks. 

        const issuesInColumnSet = new Set(orderedIssueIds);
        const otherIssues = previousIssues.filter(i => !issuesInColumnSet.has(i.id));

        // Reconstruct the sorted column issues
        // Map ID -> Issue
        const issueMap = new Map(previousIssues.map(i => [i.id, i]));
        const sortedColumnIssues = orderedIssueIds
          .map(id => issueMap.get(id))
          .filter((i): i is Issue => !!i); // Type guard to remove undefined

        // Merge: Put other issues first, then sorted column issues?
        // Order between columns relies on the array order. 
        // If we append to end, the column issues move to the end of the global list.
        // This implicitly changes their position in 'data.filter', which uses array order.
        // So yes, appending them at the end effectively reorders them relative to each other 
        // (which is what usually matters for 'data.filter').

        const newIssues = [...otherIssues, ...sortedColumnIssues];

        queryClient.setQueryData(queryKey, newIssues);
      }

      return { previousIssues };
    },
    onError: (err, newTodo, context) => {
      if (context?.previousIssues) {
        queryClient.setQueryData(queryKey, context.previousIssues);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure server sync
      queryClient.invalidateQueries({ queryKey });
    },
  });
} 