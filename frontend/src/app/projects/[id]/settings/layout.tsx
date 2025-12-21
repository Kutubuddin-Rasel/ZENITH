"use client";
import React, { ReactNode } from 'react';
import { useParams } from 'next/navigation';
import {
  Shield,
  Users,
  Cog,
  Tag,
  Puzzle,
  ShieldCheck,
  GitMerge,
} from 'lucide-react';
import SettingsNav from './SettingsNav';

interface SettingsLayoutProps {
  children: ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const params = useParams();
  const projectId = params.id as string;

  const navItems = [
    {
      name: 'General',
      href: 'general',
      icon: Cog,
    },
    {
      name: 'Access',
      href: 'access',
      icon: Users,
    },
    {
      name: 'Policies',
      href: 'policies',
      icon: Shield,
    },
    {
      name: 'Audit',
      href: 'audit',
      icon: ShieldCheck,
    },
    {
      name: 'Labels',
      href: 'labels',
      icon: Tag,
    },
    {
      name: 'Components',
      href: 'components',
      icon: Puzzle,
    },
    {
      name: 'Integrations',
      href: 'integrations',
      icon: GitMerge,
    },
  ];

  return (
    <div className="flex h-full">
      {/* Settings Sidebar */}
      <div className="w-64 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Settings</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Manage your project settings</p>
        </div>
        <SettingsNav projectId={projectId} navItems={navItems} />
      </div>

      {/* Settings Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
