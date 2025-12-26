"use client";
import React, { ReactNode } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Shield,
  Users,
  Cog,
  Tag,
  Puzzle,
  ShieldCheck,
  GitMerge,
} from 'lucide-react';

interface SettingsLayoutProps {
  children: ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const params = useParams();
  const projectId = params.id as string;
  const pathname = usePathname();

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
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950">
      {/* Horizontal Tab Bar */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6">
        <div className="flex space-x-6">
          {navItems.map((item) => {
            const href = `/projects/${projectId}/settings/${item.href}`;
            const isActive = pathname === href || pathname?.startsWith(`${href}/`);

            return (
              <Link
                key={item.name}
                href={href}
                className={cn(
                  "flex items-center gap-2 py-4 text-sm font-medium border-b-2 transition-colors",
                  isActive
                    ? "border-primary-600 text-primary-600 dark:border-primary-500 dark:text-primary-500"
                    : "border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 p-6 overflow-y-auto w-full">
        {children}
      </div>
    </div>
  );
}
