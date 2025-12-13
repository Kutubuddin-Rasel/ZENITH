"use client";
import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useProjectRole } from "@/context/RoleContext";
import Spinner from "./Spinner";
import Button from "./Button";
import { LockClosedIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

interface ProtectedProjectRouteProps {
  allowedRoles: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
  redirectTo?: string;
}

export default function ProtectedProjectRoute({
  allowedRoles,
  children,
  fallback,
  redirectTo,
}: ProtectedProjectRouteProps) {
  const params = useParams();
  const projectId = params.id as string;
  const role = useProjectRole(projectId);
  const router = useRouter();

  if (role === undefined) {
    // Still loading role info
    return fallback || <div className="flex justify-center items-center h-64"><Spinner /></div>;
  }

  if (!allowedRoles.includes(role ?? '')) {
    if (redirectTo) {
      router.replace(redirectTo);
      return null;
    }
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center bg-gradient-to-br from-white/80 via-primary-50/60 to-purple-50/80 dark:from-neutral-900/80 dark:via-primary-950/40 dark:to-purple-950/60 rounded-2xl shadow-xl border border-white/20 dark:border-neutral-800/50 p-12 mx-auto max-w-lg mt-16">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 shadow-lg mb-6">
          <LockClosedIcon className="h-8 w-8 text-white" />
        </div>
        <div className="text-3xl font-extrabold text-neutral-900 dark:text-white mb-2">Access Denied</div>
        <div className="text-lg text-neutral-600 dark:text-neutral-300 mb-6">
          You do not have permission to view this page.<br />
          If you believe this is a mistake, contact your project lead or admin.
        </div>
        <Link href="/projects">
          <Button variant="gradient" size="lg">
            Return to Projects
          </Button>
        </Link>
      </div>
    );
  }

  return <>{children}</>;
} 