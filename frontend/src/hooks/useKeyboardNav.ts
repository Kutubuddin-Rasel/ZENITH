'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface KeyboardNavOptions {
    /** Array of item IDs to navigate through */
    items: string[];
    /** Currently selected item ID */
    selectedId?: string;
    /** Callback when selection changes */
    onSelect?: (id: string) => void;
    /** Callback when 'e' is pressed to edit/open current item */
    onEdit?: (id: string) => void;
    /** Callback when 'h' is pressed (help/toggle panel) */
    onHelp?: () => void;
    /** Base URL for navigation (e.g., '/projects/abc/issues') */
    baseUrl?: string;
    /** Whether keyboard navigation is enabled */
    enabled?: boolean;
}

export interface KeyboardNavState {
    /** Currently focused item ID */
    focusedId: string | null;
    /** Index of focused item */
    focusedIndex: number;
    /** Whether keyboard nav is active */
    isActive: boolean;
}

/**
 * useKeyboardNav - Linear-style keyboard navigation hook
 * 
 * Keybindings:
 * - j: Move down (next item)
 * - k: Move up (previous item)
 * - e/Enter: Edit/open current item
 * - h: Help/toggle panel
 * - Escape: Clear selection
 * - g then g: Go to top
 * - g then e: Go to end
 */
export function useKeyboardNav({
    items,
    selectedId,
    onSelect,
    onEdit,
    onHelp,
    baseUrl,
    enabled = true,
}: KeyboardNavOptions): KeyboardNavState {
    const router = useRouter();
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const [isActive, setIsActive] = useState(false);
    const [gPressed, setGPressed] = useState(false);

    // Update focused index when items change or selectedId changes
    useEffect(() => {
        if (selectedId && items.length > 0) {
            const idx = items.indexOf(selectedId);
            if (idx !== -1) {
                setFocusedIndex(idx);
            }
        }
    }, [selectedId, items]);

    const focusedId = focusedIndex >= 0 && focusedIndex < items.length
        ? items[focusedIndex]
        : null;

    const moveDown = useCallback(() => {
        if (items.length === 0) return;
        setIsActive(true);

        if (focusedIndex === -1) {
            // First activation - select first item
            setFocusedIndex(0);
            onSelect?.(items[0]);
        } else if (focusedIndex < items.length - 1) {
            const newIndex = focusedIndex + 1;
            setFocusedIndex(newIndex);
            onSelect?.(items[newIndex]);
        }
    }, [items, focusedIndex, onSelect]);

    const moveUp = useCallback(() => {
        if (items.length === 0) return;
        setIsActive(true);

        if (focusedIndex === -1) {
            // First activation - select last item
            const lastIndex = items.length - 1;
            setFocusedIndex(lastIndex);
            onSelect?.(items[lastIndex]);
        } else if (focusedIndex > 0) {
            const newIndex = focusedIndex - 1;
            setFocusedIndex(newIndex);
            onSelect?.(items[newIndex]);
        }
    }, [items, focusedIndex, onSelect]);

    const openCurrent = useCallback(() => {
        if (focusedId) {
            if (onEdit) {
                onEdit(focusedId);
            } else if (baseUrl) {
                router.push(`${baseUrl}/${focusedId}`);
            }
        }
    }, [focusedId, onEdit, baseUrl, router]);

    const goToTop = useCallback(() => {
        if (items.length > 0) {
            setFocusedIndex(0);
            onSelect?.(items[0]);
        }
    }, [items, onSelect]);

    const goToEnd = useCallback(() => {
        if (items.length > 0) {
            const lastIndex = items.length - 1;
            setFocusedIndex(lastIndex);
            onSelect?.(items[lastIndex]);
        }
    }, [items, onSelect]);

    const clearSelection = useCallback(() => {
        setFocusedIndex(-1);
        setIsActive(false);
    }, []);

    // Handle keydown events
    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't handle if user is typing in an input
            const target = e.target as HTMLElement;
            if (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable
            ) {
                return;
            }

            // Handle 'g' prefix for gg and ge
            if (gPressed) {
                setGPressed(false);
                if (e.key === 'g') {
                    e.preventDefault();
                    goToTop();
                    return;
                }
                if (e.key === 'e') {
                    e.preventDefault();
                    goToEnd();
                    return;
                }
                // Any other key cancels the g prefix
                return;
            }

            switch (e.key) {
                case 'j':
                    e.preventDefault();
                    moveDown();
                    break;
                case 'k':
                    e.preventDefault();
                    moveUp();
                    break;
                case 'e':
                case 'Enter':
                    if (focusedId) {
                        e.preventDefault();
                        openCurrent();
                    }
                    break;
                case 'h':
                    e.preventDefault();
                    onHelp?.();
                    break;
                case 'Escape':
                    clearSelection();
                    break;
                case 'g':
                    e.preventDefault();
                    setGPressed(true);
                    // Auto-reset after 1 second if no follow-up key
                    setTimeout(() => setGPressed(false), 1000);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        enabled,
        gPressed,
        focusedId,
        moveDown,
        moveUp,
        openCurrent,
        goToTop,
        goToEnd,
        clearSelection,
        onHelp,
    ]);

    return {
        focusedId,
        focusedIndex,
        isActive,
    };
}

export default useKeyboardNav;
