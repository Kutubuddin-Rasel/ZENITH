"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster({ ...props }: ToasterProps) {
    return (
        <Sonner
            theme="system"
            position="bottom-right"
            className="toaster group !z-[9999]"
            toastOptions={{
                classNames: {
                    toast:
                        "group toast group-[.toaster]:bg-white/80 dark:group-[.toaster]:bg-neutral-900/80 group-[.toaster]:text-neutral-900 dark:group-[.toaster]:text-neutral-50 group-[.toaster]:border-white/20 dark:group-[.toaster]:border-white/10 group-[.toaster]:backdrop-blur-md group-[.toaster]:shadow-xl rounded-xl",
                    description: "group-[.toast]:text-neutral-500 dark:group-[.toast]:text-neutral-400",
                    actionButton:
                        "group-[.toast]:bg-primary-600 group-[.toast]:text-white",
                    cancelButton:
                        "group-[.toast]:bg-neutral-100 group-[.toast]:text-neutral-500 dark:group-[.toast]:bg-neutral-800 dark:group-[.toast]:text-neutral-400",
                },
            }}
            {...props}
        />
    );
}
