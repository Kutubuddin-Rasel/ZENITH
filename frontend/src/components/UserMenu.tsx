"use client";
import React, { useRef, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Menu } from '@headlessui/react';
import { ChevronDownIcon, ArrowRightOnRectangleIcon, UserIcon, Cog6ToothIcon, SparklesIcon } from '@heroicons/react/24/outline';
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
        <div className="w-8 h-8 rounded-full bg-gray-300 text-gray-900 dark:bg-gray-700 flex items-center justify-center font-bold text-sm">
          {initials}
        </div>
        <ChevronDownIcon className="h-4 w-4 text-gray-500" />
      </Menu.Button>
      {menuOpen && dropdownPosition && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="absolute z-[9999] w-56 origin-top-right bg-white dark:bg-background-dark border border-gray-200 dark:border-gray-700 rounded-md shadow-lg focus:outline-none"
          style={{
            position: 'absolute',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
          }}
        >
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="font-semibold text-gray-900 dark:text-gray-100">{user?.name || 'User'}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</div>
          </div>
          <div className="py-1">
            <button
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => { setMenuOpen(false); router.push('/profile'); }}
            >
              <UserIcon className="h-5 w-5" /> Profile
            </button>
            <button
              className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 text-primary-600 dark:text-primary-400"
              onClick={() => {
                setMenuOpen(false);
                window.dispatchEvent(new CustomEvent('zenith:reopen-onboarding'));
              }}
            >
              <SparklesIcon className="h-5 w-5" /> Getting Started
            </button>
            <button
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => { setMenuOpen(false); router.push('/settings/preferences'); }}
            >
              <Cog6ToothIcon className="h-5 w-5" /> Preferences
            </button>
            <button
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-800"
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