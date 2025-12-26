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
    ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import { useAppearance } from '@/context/AppearanceContext';
import Tooltip from '@/components/Tooltip';

const settingsNavItems = [
    {
        name: 'Profile',
        href: '/settings/profile',
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
        name: 'Appearance',
        href: '/settings/appearance',
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
    const { settings } = useAppearance();
    const isCompact = settings.sidebarStyle === 'compact';

    return (
        <div className="flex min-h-screen bg-neutral-50 dark:bg-[#0a0a0a]">
            {/* Sidebar - Fixed left column, responsive to compact mode */}
            <aside className={`hidden md:flex md:flex-col flex-shrink-0 h-screen sticky top-0 border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 transition-all duration-300 ${isCompact ? 'w-20' : 'w-64'}`}>
                {/* Logo Header */}
                <div className={`py-5 ${isCompact ? 'px-4 flex justify-center' : 'px-4'}`}>
                    <Link
                        href="/projects"
                        className="flex items-center gap-2 group"
                    >
                        <div className={`bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center ${isCompact ? 'w-10 h-10' : 'w-8 h-8'}`}>
                            <span className={`text-white font-bold ${isCompact ? 'text-base' : 'text-sm'}`}>Z</span>
                        </div>
                        {!isCompact && (
                            <span className="font-bold text-xl text-primary-600 dark:text-primary-400 group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                                Zenith
                            </span>
                        )}
                    </Link>
                </div>

                {/* Back Link - Distinct and separated */}
                <div className={`pb-4 border-b border-neutral-100 dark:border-neutral-800 ${isCompact ? 'px-2' : 'px-3'}`}>
                    <Tooltip label={isCompact ? 'Back to Dashboard' : ''}>
                        <Link
                            href="/projects"
                            className={`flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all ${isCompact ? 'justify-center px-2' : 'px-3'}`}
                        >
                            <ArrowLeftIcon className={`${isCompact ? 'w-5 h-5' : 'w-4 h-4'}`} />
                            {!isCompact && 'Back to Dashboard'}
                        </Link>
                    </Tooltip>
                </div>

                {/* Settings Section Title */}
                {!isCompact && (
                    <div className="px-6 pt-6 pb-3">
                        <h2 className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                            Settings
                        </h2>
                    </div>
                )}

                {/* Navigation */}
                <nav className={`flex-1 space-y-1 overflow-y-auto ${isCompact ? 'px-2 pt-4' : 'px-3'}`}>
                    {settingsNavItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href ||
                            (item.href !== '/settings/profile' && pathname?.startsWith(item.href));

                        return (
                            <Tooltip key={item.name} label={isCompact ? item.name : ''}>
                                <Link
                                    href={item.href}
                                    className={`flex items-center rounded-lg text-sm transition-all duration-150 ${isCompact
                                        ? 'justify-center px-2 py-3'
                                        : 'gap-3 px-3 py-2.5'
                                        } ${isActive
                                            ? 'bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-400 font-medium'
                                            : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-white'
                                        }`}
                                >
                                    <Icon className={`flex-shrink-0 ${isCompact ? 'h-6 w-6' : 'h-5 w-5'} ${isActive ? 'text-primary-600 dark:text-primary-400' : 'text-neutral-400 dark:text-neutral-500'}`} />
                                    {!isCompact && <span>{item.name}</span>}
                                </Link>
                            </Tooltip>
                        );
                    })}
                </nav>

                {/* Footer spacer */}
                <div className="p-4"></div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 min-h-screen overflow-y-auto">
                {/* Mobile Header - shown only on mobile */}
                <div className="md:hidden sticky top-0 z-10 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm border-b border-neutral-200 dark:border-neutral-800 px-4 py-3">
                    <div className="flex items-center justify-between">
                        <Link
                            href="/projects"
                            className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400"
                        >
                            <ArrowLeftIcon className="w-4 h-4" />
                            Back
                        </Link>
                        <h1 className="text-base font-semibold text-neutral-900 dark:text-white">Settings</h1>
                        <div className="w-12"></div>
                    </div>
                </div>

                {/* Content wrapper - Wide layout for premium feel */}
                <div className="w-full max-w-5xl px-10 py-12">
                    {children}
                </div>
            </main>
        </div>
    );
}
