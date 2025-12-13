"use client";
import React from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import ProtectedRoute from '@/components/ProtectedRoute';

type LayoutParams = { id: string };

export default function Layout({ children, params }: { children: React.ReactNode; params: Promise<LayoutParams>; }) {
  const paramsObj = React.use(params);
  const projectId = paramsObj.id;
  
  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-background dark:bg-background-dark">
        <Sidebar projectId={projectId} />
        <div className="flex-1 flex flex-col min-w-0 h-screen">
          <Topbar title="Project Dashboard" />
          <main className="flex-1 min-h-0 p-8 overflow-y-auto">{children}</main>
        </div>
      </div>
    </ProtectedRoute>
  );
} 