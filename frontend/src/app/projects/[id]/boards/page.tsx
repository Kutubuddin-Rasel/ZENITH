"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Spinner from "../../../../components/Spinner";
import Card from "../../../../components/Card";
import Button from "../../../../components/Button";
import Typography from "../../../../components/Typography";
import CreateBoardWizardModal from '@/components/CreateBoardWizardModal';
import { useProject } from '@/hooks/useProject';
import { useToast } from '@/context/ToastContext';

// Fetch boards for the project
async function fetchBoards(projectId: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/projects/${projectId}/boards`, {
    headers: {
      "Authorization": typeof window !== "undefined" ? `Bearer ${localStorage.getItem("access_token")}` : ""
    },
    credentials: "include"
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function BoardsLandingPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: boards, isLoading, isError } = useQuery({
    queryKey: ["project-boards", projectId],
    queryFn: () => fetchBoards(projectId),
    enabled: !!projectId,
  });

  const [isCreateWizardOpen, setIsCreateWizardOpen] = useState(false);

  const { project } = useProject(projectId);
  const { showToast } = useToast();

  useEffect(() => {
    if (boards && boards.length === 1) {
      router.replace(`/projects/${projectId}/boards/${boards[0].id}`);
    }
  }, [boards, projectId, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <Spinner className="h-8 w-8 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
          <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
            Loading boards...
          </Typography>
        </div>
      </div>
    );
  }
  
  if (isError) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <Typography variant="h3" className="text-red-600 dark:text-red-400 mb-2">
            Failed to load boards
          </Typography>
          <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
            Please try refreshing the page
          </Typography>
        </div>
      </div>
    );
  }
  
  if (!boards || boards.length === 0) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <Typography variant="h2" className="text-neutral-900 dark:text-white mb-2">
            No boards found
          </Typography>
          <Typography variant="body" className="text-neutral-600 dark:text-neutral-400 mb-6">
            Create a board to get started with your project management.
          </Typography>
          <Button 
            variant="primary" 
            size="lg" 
            onClick={() => setIsCreateWizardOpen(true)}
          >
            Create Board
          </Button>
          {isCreateWizardOpen && (
            <CreateBoardWizardModal
              open={isCreateWizardOpen}
              onClose={() => setIsCreateWizardOpen(false)}
              onCreate={async ({ type, name, description, columns }) => {
                try {
                  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/projects/${projectId}/boards`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': typeof window !== 'undefined' ? `Bearer ${localStorage.getItem('access_token')}` : ''
                    },
                    credentials: 'include',
                    body: JSON.stringify({
                      name,
                      type,
                      description,
                      columns: columns.map((c: { name: string }) => ({ name: c.name })),
                    })
                  });
                  if (!res.ok) throw new Error(await res.text());
                  const board = await res.json();
                  showToast('Board created!', 'success');
                  router.push(`/projects/${projectId}/boards/${board.id}`);
                } catch (err: unknown) {
                  const errorMessage = err instanceof Error ? err.message : 'Failed to create board';
                  showToast(errorMessage, 'error');
                  throw err;
                }
              }}
              defaultProjectName={project?.name}
            />
          )}
        </div>
      </div>
    );
  }
  
  if (boards.length === 1) {
    // Redirect handled by useEffect
    return null;
  }
  
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      <div className="max-w-4xl mx-auto py-12 px-6">
        <div className="text-center mb-8">
          <Typography variant="h1" className="text-neutral-900 dark:text-white mb-2">
            Select a Board
          </Typography>
          <Typography variant="body" className="text-neutral-600 dark:text-neutral-400">
            Choose a board to manage your project workflow
          </Typography>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {boards.map((board: { id: string; name: string; description?: string }) => (
            <Card 
              key={board.id} 
              className="p-6 hover:shadow-md transition-shadow cursor-pointer" 
              onClick={() => router.push(`/projects/${projectId}/boards/${board.id}`)}
            >
              <Typography variant="h3" className="text-neutral-900 dark:text-white mb-2">
                {board.name}
              </Typography>
              <Typography variant="body" className="text-neutral-600 dark:text-neutral-400 mb-4 flex-1">
                {board.description || "No description"}
              </Typography>
              <Button 
                variant="secondary" 
                size="sm" 
                className="w-full"
                onClick={e => { 
                  e.stopPropagation(); 
                  router.push(`/projects/${projectId}/boards/${board.id}`); 
                }}
              >
                Open Board
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
} 