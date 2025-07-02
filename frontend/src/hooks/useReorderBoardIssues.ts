import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "../lib/fetcher";
import { getSocket } from "../lib/socket";

export function useReorderBoardIssues(projectId: string, boardId: string) {
  return useMutation({
    mutationFn: async ({
      columnId,
      orderedIssueIds,
    }: {
      columnId: string;
      orderedIssueIds: string[];
    }) => {
      const socket = getSocket();
      // Use WebSocket if available for real-time events
      if (socket) {
        socket.emit("reorder-issue", { projectId, boardId, columnId, orderedIssueIds });
        return { message: "Issue reorder event sent." };
      }
      // Fallback to a standard HTTP request
      return apiFetch(`/projects/${projectId}/boards/${boardId}/issues/reorder`, {
        method: "POST",
        body: JSON.stringify({ columnId, orderedIssueIds }),
      });
    },
  });
} 