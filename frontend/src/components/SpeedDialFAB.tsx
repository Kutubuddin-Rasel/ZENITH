"use client";
import React, { useState, useRef, useEffect } from 'react';
import { EllipsisHorizontalIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Transition } from '@headlessui/react';

export interface SpeedDialAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

interface SpeedDialFABProps {
  actions: SpeedDialAction[];
}

/**
 * SpeedDialFAB - A professional, subtle floating action button
 * 
 * Design principles:
 * - Neutral colors that don't distract from main content
 * - Compact size appropriate for productivity apps
 * - Clean minimal styling matching Linear/Notion aesthetics
 */
const SpeedDialFAB: React.FC<SpeedDialFABProps> = ({ actions }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-40">
      <div className="relative flex flex-col items-end gap-2">
        {/* Action Buttons */}
        <Transition
          show={isOpen}
          as="div"
          className="flex flex-col items-end gap-2 mb-2"
          enter="transition-all ease-out duration-200"
          enterFrom="opacity-0 translate-y-2"
          enterTo="opacity-100 translate-y-0"
          leave="transition-all ease-in duration-150"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-2"
        >
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={() => {
                action.onClick();
                setIsOpen(false);
              }}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-sm font-medium shadow-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 transition-all duration-200"
              aria-label={action.label}
            >
              <span className="text-neutral-500 dark:text-neutral-400 [&>svg]:h-4 [&>svg]:w-4">
                {action.icon}
              </span>
              <span>{action.label}</span>
            </button>
          ))}
        </Transition>

        {/* Main FAB Button - Subtle, professional design */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`
            flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
            font-medium text-sm shadow-lg
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-offset-2
            ${isOpen
              ? 'bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 focus:ring-neutral-500'
              : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 focus:ring-neutral-400'
            }
          `}
          aria-label="Toggle Actions"
          aria-expanded={isOpen}
        >
          <Transition
            as={React.Fragment}
            show={!isOpen}
            enter="transform transition duration-150 ease-out"
            enterFrom="scale-0 rotate-90"
            enterTo="scale-100 rotate-0"
            leave="transform transition duration-100 ease-in"
            leaveFrom="scale-100 rotate-0"
            leaveTo="scale-0 rotate-90"
          >
            <EllipsisHorizontalIcon className="h-5 w-5" />
          </Transition>
          <Transition
            as={React.Fragment}
            show={isOpen}
            enter="transform transition duration-150 ease-out"
            enterFrom="scale-0 -rotate-90"
            enterTo="scale-100 rotate-0"
            leave="transform transition duration-100 ease-in"
            leaveFrom="scale-100 rotate-0"
            leaveTo="scale-0 -rotate-90"
          >
            <XMarkIcon className="h-5 w-5" />
          </Transition>
          <span>{isOpen ? 'Close' : 'Actions'}</span>
        </button>
      </div>
    </div>
  );
};

export default SpeedDialFAB;