"use client";
import React, { ReactNode, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProjectsCreateModalContext from '@/context/ProjectsCreateModalContext';

// This is the correct signature for a dynamic route layout in Next.js app directory
export default function ProjectsLayout({ children }: { children: ReactNode }) {
  const [openModal, setOpenModal] = useState<(() => void) | undefined>(undefined);

  return (
    <ProtectedRoute>
      <ProjectsCreateModalContext.Provider value={setOpenModal}>
        <div className="min-h-screen bg-background dark:bg-background-dark">
          {children}
        </div>
      </ProjectsCreateModalContext.Provider>
    </ProtectedRoute>
  );
} 