"use client";

import React, { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { NotificationsSocketProvider } from '../context/NotificationsSocketProvider';
import { RoleProvider } from '../context/RoleContext';
import { ProgressiveDisclosureProvider } from '../context/ProgressiveDisclosureContext';
import QueryClientWrapper from './QueryClientWrapper';
import ThemeScript from './ThemeScript';
import SecurityScript from './SecurityScript';
import ThemeEffect from './ThemeEffect';

import dynamic from 'next/dynamic';

const OnboardingManager = dynamic(() => import('./OnboardingManager'), {
    ssr: false,
});

interface AppProvidersProps {
    children: ReactNode;
}

export default function AppProviders({ children }: AppProvidersProps) {
    const pathname = usePathname();
    const isAuthPage = pathname?.startsWith('/auth') || pathname === '/';

    return (
        <ToastProvider>
            <ThemeProvider>
                <AuthProvider>
                    <RoleProvider>
                        <ProgressiveDisclosureProvider>
                            <QueryClientWrapper>
                                <NotificationsSocketProvider>
                                    <SecurityScript />
                                    <ThemeScript />
                                    <ThemeEffect />
                                    {!isAuthPage && <OnboardingManager />}
                                    {children}
                                </NotificationsSocketProvider>
                            </QueryClientWrapper>
                        </ProgressiveDisclosureProvider>
                    </RoleProvider>
                </AuthProvider>
            </ThemeProvider>
        </ToastProvider>
    );
}
