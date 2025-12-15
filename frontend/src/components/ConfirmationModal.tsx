import React, { Fragment, useRef } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import Button from './Button';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmButtonVariant?: 'primary' | 'secondary' | 'danger';
  isLoading?: boolean;
}

export default function ConfirmationModal({
  isOpen,
  open, // Support legacy prop
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmButtonVariant = 'danger',
  isLoading = false,
}: ConfirmationModalProps & { open?: boolean }) {
  const cancelButtonRef = useRef(null);
  // Robustly handle visibility: prefer isOpen, fallback to open, default to false
  const showModal = isOpen ?? open ?? false;

  return (
    <Transition.Root show={showModal} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-50"
        initialFocus={cancelButtonRef}
        onClose={onClose}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-neutral-900/50 backdrop-blur-sm transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white dark:bg-neutral-800 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-neutral-200 dark:border-neutral-700">
                <div className="bg-white dark:bg-neutral-800 px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
                  <div className="sm:flex sm:items-start">
                    <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20 sm:mx-0 sm:h-10 sm:w-10">
                      <ExclamationTriangleIcon
                        className="h-6 w-6 text-red-600 dark:text-red-400"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                      <Dialog.Title
                        as="h3"
                        className="text-base font-semibold leading-6 text-neutral-900 dark:text-white"
                      >
                        {title}
                      </Dialog.Title>
                      <div className="mt-2">
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">
                          {message}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-neutral-50 dark:bg-neutral-800/50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 gap-3">
                  <Button
                    variant={confirmButtonVariant}
                    onClick={onConfirm}
                    loading={isLoading}
                    disabled={isLoading}
                  >
                    {confirmText}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={onClose}
                    disabled={isLoading}
                    ref={cancelButtonRef}
                  >
                    {cancelText}
                  </Button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}