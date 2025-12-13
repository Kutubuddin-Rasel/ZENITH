
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
    LayoutDashboardIcon,
    SettingsIcon,
    UserIcon,
    PlusIcon,
    LogOutIcon,
    BriefcaseIcon,
    Search,
    FileTextIcon,
    Loader2
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useOmnibar } from "@/hooks/useOmnibar";
import { useDebounce } from "@/hooks/useDebounce";

export function CommandMenu() {
    const router = useRouter();
    const [open, setOpen] = React.useState(false);
    const { logout } = useAuth();

    // Search State
    const [search, setSearch] = React.useState('');
    const debouncedSearch = useDebounce(search, 300);
    const { data, isLoading } = useOmnibar(debouncedSearch);

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };

        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    const runCommand = React.useCallback((command: () => void) => {
        setOpen(false);
        command();
    }, []);

    return (
        <Command.Dialog
            open={open}
            onOpenChange={setOpen}
            label="Global Command Menu"
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[640px] bg-white dark:bg-neutral-900 rounded-xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden z-50 animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95"
        >
            <div className="flex items-center border-b border-neutral-200 dark:border-neutral-800 px-3">
                {isLoading ? (
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin mr-2" />
                ) : (
                    <Search className="w-5 h-5 text-neutral-400 mr-2" />
                )}
                <Command.Input
                    placeholder="Type a command or search..."
                    className="w-full h-14 bg-transparent outline-none text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 text-lg"
                    value={search}
                    onValueChange={setSearch}
                />
            </div>

            <Command.List className="max-h-[400px] overflow-y-auto overflow-x-hidden p-2 custom-scrollbar">
                <Command.Empty className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
                    No results found.
                </Command.Empty>

                {/* Dynamic Results */}
                {data?.issues && data.issues.length > 0 && (
                    <Command.Group heading="Issues" className="text-xs font-medium text-neutral-400 dark:text-neutral-500 mb-2 px-2 uppercase tracking-wider">
                        {data.issues.map(issue => (
                            <Command.Item
                                key={issue.id}
                                onSelect={() => runCommand(() => router.push(`/projects/issues/${issue.key || issue.id}`))} // Assuming route structure
                                className="flex items-center px-2 py-2 text-sm text-neutral-700 dark:text-neutral-300 rounded-md cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 aria-selected:bg-neutral-100 dark:aria-selected:bg-neutral-800 transition-colors"
                            >
                                <FileTextIcon className="mr-2 h-4 w-4 text-blue-500" />
                                <span className="font-mono mr-2 text-xs opacity-70">{issue.key}</span>
                                {issue.title}
                            </Command.Item>
                        ))}
                    </Command.Group>
                )}

                {data?.projects && data.projects.length > 0 && (
                    <Command.Group heading="Projects" className="text-xs font-medium text-neutral-400 dark:text-neutral-500 mb-2 px-2 uppercase tracking-wider">
                        {data.projects.map(project => (
                            <Command.Item
                                key={project.id}
                                onSelect={() => runCommand(() => router.push(`/projects/${project.id}`))}
                                className="flex items-center px-2 py-2 text-sm text-neutral-700 dark:text-neutral-300 rounded-md cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 aria-selected:bg-neutral-100 dark:aria-selected:bg-neutral-800 transition-colors"
                            >
                                <BriefcaseIcon className="mr-2 h-4 w-4 text-green-500" />
                                {project.name}
                            </Command.Item>
                        ))}
                    </Command.Group>
                )}

                <Command.Separator className="my-2 h-px bg-neutral-200 dark:bg-neutral-800" />

                <Command.Group heading="Navigation" className="text-xs font-medium text-neutral-400 dark:text-neutral-500 mb-2 px-2 uppercase tracking-wider">
                    <Command.Item
                        onSelect={() => runCommand(() => router.push("/dashboard"))}
                        className="flex items-center px-2 py-2 text-sm text-neutral-700 dark:text-neutral-300 rounded-md cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 aria-selected:bg-neutral-100 dark:aria-selected:bg-neutral-800 transition-colors"
                    >
                        <LayoutDashboardIcon className="mr-2 h-4 w-4" />
                        Dashboard
                    </Command.Item>
                    <Command.Item
                        onSelect={() => runCommand(() => router.push("/projects"))}
                        className="flex items-center px-2 py-2 text-sm text-neutral-700 dark:text-neutral-300 rounded-md cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 aria-selected:bg-neutral-100 dark:aria-selected:bg-neutral-800 transition-colors"
                    >
                        <BriefcaseIcon className="mr-2 h-4 w-4" />
                        Projects
                    </Command.Item>
                    <Command.Item
                        onSelect={() => runCommand(() => router.push("/settings"))}
                        className="flex items-center px-2 py-2 text-sm text-neutral-700 dark:text-neutral-300 rounded-md cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 aria-selected:bg-neutral-100 dark:aria-selected:bg-neutral-800 transition-colors"
                    >
                        <SettingsIcon className="mr-2 h-4 w-4" />
                        Settings
                    </Command.Item>
                </Command.Group>

                <Command.Group heading="Actions" className="text-xs font-medium text-neutral-400 dark:text-neutral-500 mb-2 px-2 uppercase tracking-wider mt-2">
                    <Command.Item
                        onSelect={() => runCommand(() => router.push("/new-project"))}
                        className="flex items-center px-2 py-2 text-sm text-neutral-700 dark:text-neutral-300 rounded-md cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 aria-selected:bg-neutral-100 dark:aria-selected:bg-neutral-800 transition-colors"
                    >
                        <PlusIcon className="mr-2 h-4 w-4" />
                        Create New Project
                    </Command.Item>
                </Command.Group>

                <Command.Group heading="Account" className="text-xs font-medium text-neutral-400 dark:text-neutral-500 mb-2 px-2 uppercase tracking-wider mt-2">
                    <Command.Item
                        onSelect={() => runCommand(() => router.push("/profile"))}
                        className="flex items-center px-2 py-2 text-sm text-neutral-700 dark:text-neutral-300 rounded-md cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 aria-selected:bg-neutral-100 dark:aria-selected:bg-neutral-800 transition-colors"
                    >
                        <UserIcon className="mr-2 h-4 w-4" />
                        Profile
                    </Command.Item>
                    <Command.Item
                        onSelect={() => runCommand(() => logout())}
                        className="flex items-center px-2 py-2 text-sm text-red-600 dark:text-red-400 rounded-md cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/10 aria-selected:bg-red-50 dark:aria-selected:bg-red-900/10 transition-colors"
                    >
                        <LogOutIcon className="mr-2 h-4 w-4" />
                        Log Out
                    </Command.Item>
                </Command.Group>
            </Command.List>
        </Command.Dialog>
    );
}
