"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    BellIcon,
    Cog6ToothIcon,
    UserCircleIcon,
    ShieldCheckIcon,
    CodeBracketIcon,
} from '@heroicons/react/24/outline';

const settingsNavItems = [
    {
        name: 'Profile',
        href: '/profile',
        icon: UserCircleIcon,
        description: 'Manage your account',
    },
    {
        name: 'Notifications',
        href: '/settings/notifications',
        icon: BellIcon,
        description: 'Email and push settings',
    },
    {
        name: 'Preferences',
        href: '/settings/preferences',
        icon: Cog6ToothIcon,
        description: 'Theme, timezone, and display',
    },
    {
        name: 'Security',
        href: '/settings/security',
        icon: ShieldCheckIcon,
        description: '2FA and password',
    },
    {
        name: 'Developer',
        href: '/settings/developer',
        icon: CodeBracketIcon,
        description: 'API tokens',
    },
];

interface SettingsLayoutProps {
    children: React.ReactNode;
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
    const pathname = usePathname();

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-[#0a0a0a]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex gap-8">
                    {/* Sidebar */}
                    <aside className="w-64 flex-shrink-0">
                        <div className="sticky top-8">
                            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-6">
                                Settings
                            </h1>
                            <nav className="space-y-1">
                                {settingsNavItems.map((item) => {
                                    const Icon = item.icon;
                                    const isActive = pathname === item.href ||
                                        (item.href !== '/profile' && pathname?.startsWith(item.href));

                                    return (
                                        <Link
                                            key={item.name}
                                            href={item.href}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
                                                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 border border-primary-200 dark:border-primary-800'
                                                : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                                                }`}
                                        >
                                            <Icon className={`h-5 w-5 ${isActive ? 'text-primary-600' : 'text-neutral-400'}`} />
                                            <div>
                                                <p className="font-medium">{item.name}</p>
                                                <p className={`text-xs ${isActive ? 'text-primary-600/70' : 'text-neutral-500'}`}>
                                                    {item.description}
                                                </p>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>
                    </aside>

                    {/* Main Content */}
                    <main className="flex-1 min-w-0">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
