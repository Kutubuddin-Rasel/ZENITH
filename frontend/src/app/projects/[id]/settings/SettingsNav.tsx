"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface SettingsNavProps {
  projectId: string;
  navItems: NavItem[];
}

export default function SettingsNav({ projectId, navItems }: SettingsNavProps) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const href = `/projects/${projectId}/settings/${item.href}`;
        const isActive = pathname === href;
        const Icon = item.icon;
        return (
          <Link
            key={item.name}
            href={href}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors
              ${isActive
                ? 'bg-accent-blue text-white'
                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'
              }`}
          >
            <Icon className="h-5 w-5" />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
} 