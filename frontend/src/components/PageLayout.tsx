import React from 'react';
import { useAuth } from '@/context/AuthContext';
import UserMenu from './UserMenu';
import NotificationPopover from './NotificationPopover';
import ThemeToggle from './ThemeToggle';
import Typography from './Typography';
import Link from 'next/link';

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  showBackButton?: boolean;
  onBack?: () => void;
  className?: string;
}

const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  title,
  subtitle,
  actions,
  showBackButton = false,
  onBack,
  className = '',
}) => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4">
          {/* Left side */}
          <div className="flex items-center gap-4">
            {showBackButton && onBack && (
              <button
                onClick={onBack}
                className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            
            <div className="flex items-center gap-3">
              {/* App Logo - Clickable */}
              <Link 
                href="/projects" 
                className="flex items-center gap-3 hover:opacity-80 transition-opacity duration-200 group"
              >
                <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow duration-200">
                  <span className="text-white font-semibold text-sm">Z</span>
                </div>
                <div className="hidden sm:block">
                  <Typography variant="h5" className="!text-lg font-bold text-primary-600 dark:text-primary-400">
                    Zenith
                  </Typography>
                </div>
              </Link>
              
              {/* Page Title - Only show if not on projects page */}
              {title && title !== "Projects" && (
                <>
                  <div className="hidden md:block w-px h-6 bg-neutral-300 dark:bg-neutral-600" />
                  <div className="hidden md:block">
                    <Typography variant="h2" className="!text-xl">
                      {title}
                    </Typography>
                    {subtitle && (
                      <Typography variant="body-sm" color="muted">
                        {subtitle}
                      </Typography>
                    )}
                  </div>
                </>
              )}
              
              {/* Mobile title - show on small screens */}
              {title && (
                <div className="md:hidden">
                  <Typography variant="h2" className="!text-lg">
                    {title}
                  </Typography>
                  {subtitle && (
                    <Typography variant="body-xs" color="muted">
                      {subtitle}
                    </Typography>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            {/* Welcome message - hide on small screens */}
            {user && (
              <span className="hidden lg:block text-sm text-neutral-600 dark:text-neutral-400">
                Welcome, <span className="font-medium text-primary-600 dark:text-primary-400">{user.name}</span>
              </span>
            )}
            
            {/* Action buttons */}
            {actions && (
              <div className="flex items-center gap-3">
                {actions}
              </div>
            )}
            
            {/* User controls */}
            <div className="flex items-center gap-2 p-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
              <NotificationPopover />
              <div className="w-px h-6 bg-neutral-300 dark:bg-neutral-600" />
              <ThemeToggle />
            </div>
            
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className={`p-6 ${className}`}>
        {children}
      </main>
    </div>
  );
};

export default PageLayout; 