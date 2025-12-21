"use client";
import React, { useState } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { Transition } from '@headlessui/react';

export interface SpeedDialAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

interface SpeedDialFABProps {
  actions: SpeedDialAction[];
}

const SpeedDialFAB: React.FC<SpeedDialFABProps> = ({ actions }) => {
  const [isOpen, setIsOpen] = useState(false);

  // The 'click outside' useEffect has been removed for debugging.

  return (
    <div className="fixed bottom-8 right-8 z-40">
      <div className="relative flex flex-col items-center gap-4">
        {/* Action Buttons */}
        <Transition
          show={isOpen}
          as="div"
          className="flex flex-col items-center gap-4"
          enter="transition-all ease-out duration-300"
          enterFrom="opacity-0 -translate-y-2"
          enterTo="opacity-100 translate-y-0"
          leave="transition-all ease-in duration-200"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 -translate-y-2"
        >
          {actions.map((action, index) => (
            <div key={index} className="relative group flex items-center">
              <span className="absolute right-full mr-4 px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-sm font-medium shadow-lg whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                {action.label}
              </span>
              <button
                onClick={() => {
                  action.onClick();
                  setIsOpen(false);
                }}
                className="flex items-center gap-3 px-6 py-3 rounded-full bg-white dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 font-semibold shadow-lg hover:bg-neutral-100 dark:hover:bg-neutral-600 transition-all duration-300 text-base"
                aria-label={action.label}
              >
                {/* Icon must already have the correct size class (e.g., h-6 w-6) at the call site */}
                {action.icon}
                <span>{action.label}</span>
              </button>
            </div>
          ))}
        </Transition>

        {/* Main FAB */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-center gap-2 px-6 py-4 rounded-full bg-gradient-to-r from-green-400 to-blue-500 text-white font-bold shadow-2xl hover:scale-105 hover:shadow-blue-400/30 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-blue-400 text-lg"
          aria-label="Toggle Actions"
          aria-expanded={isOpen}
        >
          <Transition
            as={React.Fragment}
            show={!isOpen}
            enter="transform transition duration-200 ease-out"
            enterFrom="scale-0 rotate-45"
            enterTo="scale-100 rotate-0"
            leave="transform transition duration-200 ease-in"
            leaveFrom="scale-100 rotate-0"
            leaveTo="scale-0 rotate-45"
          >
            <PlusIcon className="h-7 w-7" />
          </Transition>
          <Transition
            as={React.Fragment}
            show={isOpen}
            enter="transform transition duration-200 ease-out"
            enterFrom="scale-0 -rotate-45"
            enterTo="scale-100 rotate-0"
            leave="transform transition duration-200 ease-in"
            leaveFrom="scale-100 rotate-0"
            leaveTo="scale-0 -rotate-45"
          >
            <XMarkIcon className="h-7 w-7" />
          </Transition>
          <span className="relative">
            {isOpen ? 'Close' : 'Actions'}
          </span>
        </button>
      </div>
    </div>
  );
};

export default SpeedDialFAB; 