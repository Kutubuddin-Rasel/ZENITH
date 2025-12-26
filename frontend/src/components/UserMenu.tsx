"use client";
import React, { useRef, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Menu } from '@headlessui/react';
import { ChevronDownIcon, ArrowRightOnRectangleIcon, Cog6ToothIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';

const UserMenu = () => {
  const { user, logout } = useAuth();
  const router = useRouter();
  const initials = user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U';
  const [menuOpen, setMenuOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menuOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8, // 8px margin
        left: rect.right + window.scrollX - 224, // 224px = w-56
      });
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function handle(e: MouseEvent) {
      if (
        buttonRef.current && buttonRef.current.contains(e.target as Node)
      ) return;
      if (
        dropdownRef.current && dropdownRef.current.contains(e.target as Node)
      ) return;
      setMenuOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [menuOpen]);

  return (
    <Menu as="div" className="relative inline-block text-left ml-2">
      <Menu.Button ref={buttonRef} className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-accent-blue rounded-full" onClick={() => setMenuOpen((v) => !v)}>
        <div className="w-8 h-8 rounded-full bg-neutral-300 text-neutral-900 dark:bg-neutral-700 flex items-center justify-center font-bold text-sm overflow-hidden">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl.startsWith('http') ? user.avatarUrl : `http://localhost:3000${user.avatarUrl}`}
              alt={user.name || 'Avatar'}
              className="w-full h-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
        <ChevronDownIcon className="h-4 w-4 text-neutral-500" />
      </Menu.Button>
      {menuOpen && dropdownPosition && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="absolute z-[9999] w-56 origin-top-right bg-white dark:bg-background-dark border border-neutral-200 dark:border-neutral-700 rounded-md shadow-lg focus:outline-none"
          style={{
            position: 'absolute',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
          }}
        >
          <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center font-bold text-sm overflow-hidden flex-shrink-0">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl.startsWith('http') ? user.avatarUrl : `http://localhost:3000${user.avatarUrl}`}
                  alt={user.name || 'Avatar'}
                  className="w-full h-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">{user?.name || 'User'}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{user?.email}</div>
            </div>
          </div>
          <div className="py-1">
            <button
              className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 text-primary-600 dark:text-primary-400"
              onClick={() => {
                setMenuOpen(false);
                window.dispatchEvent(new CustomEvent('zenith:reopen-onboarding'));
              }}
            >
              <SparklesIcon className="h-5 w-5" /> Getting Started
            </button>
            <button
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => { setMenuOpen(false); router.push('/settings/appearance'); }}
            >
              <Cog6ToothIcon className="h-5 w-5" /> Settings
            </button>
            <button
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => { setMenuOpen(false); logout(); }}
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5" /> Log out
            </button>
          </div>
        </div>,
        document.body
      )}
    </Menu>
  );
};

export default UserMenu; 