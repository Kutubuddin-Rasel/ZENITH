"use client";
import React from 'react';
import ThemeToggle from './ThemeToggle';
import Button from './Button';
import NotificationPopover from './NotificationPopover';
import UserMenu from './UserMenu';
import Breadcrumbs from './Breadcrumbs';

interface TopbarProps {
  title?: string;
  onCreate?: () => void;
}

const Topbar = ({ title, onCreate }: TopbarProps) => {
  return (
    <header className="sticky top-0 z-30 bg-gradient-to-r from-white/95 via-white/90 to-white/95 dark:from-gray-950/95 dark:via-gray-950/90 dark:to-gray-950/95 backdrop-blur-xl border-b border-white/20 dark:border-gray-800/50 shadow-2xl h-20 relative">
      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-50/20 via-purple-50/10 to-blue-50/20 dark:from-blue-950/10 dark:via-purple-950/5 dark:to-blue-950/10 pointer-events-none" />
      
      {/* Content */}
      <div className="relative flex items-center justify-between px-8 h-full">
        {/* Left side */}
        <div className="flex items-center gap-6 min-w-0 flex-shrink">
          <div className="flex items-center gap-4 min-w-0">
            <Breadcrumbs />
            <div className="h-8 w-px bg-gradient-to-b from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-gray-200 dark:to-white bg-clip-text text-transparent truncate max-w-xs md:max-w-md lg:max-w-2xl">
              {title}
            </h1>
          </div>
          {onCreate && (
            <>
              <div className="h-8 w-px bg-gradient-to-b from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
              <Button 
                className="hidden md:inline-flex bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold px-6 py-2.5 rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transform hover:scale-105 transition-all duration-300 border-0" 
                size="sm" 
                onClick={onCreate}
              >
                <span className="mr-2">+</span>
                Create
              </Button>
            </>
          )}
      </div>
        {/* Spacer to push right side to the edge */}
        <div className="flex-1" />
        {/* Right side */}
        <div className="flex items-center gap-4 min-w-fit relative z-50">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border border-white/20 dark:border-gray-800/30 shadow-lg">
        <NotificationPopover />
            <div className="h-6 w-px bg-gradient-to-b from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
        <ThemeToggle />
          </div>
          <div className="h-8 w-px bg-gradient-to-b from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
        <UserMenu />
        </div>
      </div>
    </header>
  );
};

export default Topbar; 