import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface IssueFilters {
    search: string;
    status: string;
    assigneeId: string;
    label: string;
    sprint: string;
    sort: string;
    includeArchived: boolean;
}

interface IssuesState {
    // Filters
    filters: IssueFilters;

    // UI State
    showFilters: boolean;

    // Actions
    setFilter: (key: keyof IssueFilters, value: string | boolean) => void;
    resetFilters: () => void;
    toggleFilters: () => void;
    setFilters: (filters: Partial<IssueFilters>) => void;
}

const initialState: IssueFilters = {
    search: '',
    status: '',
    assigneeId: '',
    label: '',
    sprint: '',
    sort: 'updatedAt',
    includeArchived: false,
};

export const useIssuesStore = create<IssuesState>()(
    devtools(
        persist(
            (set) => ({
                filters: initialState,
                showFilters: false,

                setFilter: (key, value) =>
                    set((state) => ({
                        filters: { ...state.filters, [key]: value },
                    })),

                resetFilters: () =>
                    set({ filters: initialState }),

                toggleFilters: () =>
                    set((state) => ({ showFilters: !state.showFilters })),

                setFilters: (newFilters) =>
                    set((state) => ({
                        filters: { ...state.filters, ...newFilters },
                    })),
            }),
            {
                name: 'issues-storage', // unique name for localStorage key
                partialize: (state) => ({ filters: state.filters, showFilters: state.showFilters }), // Only persist filters and UI state
            }
        )
    )
);
