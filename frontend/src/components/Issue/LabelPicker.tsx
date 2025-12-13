import React, { useState, useRef, useEffect } from 'react';
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';

interface LabelPickerProps {
    labels: string[];
    onChange: (newLabels: string[]) => void;
    readOnly?: boolean;
}

export default function LabelPicker({ labels = [], onChange, readOnly = false }: LabelPickerProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    // Click outside to close
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsEditing(false);
                setInputValue('');
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleAdd = () => {
        const trimmed = inputValue.trim();
        if (trimmed && !labels.includes(trimmed)) {
            onChange([...labels, trimmed]);
        }
        setInputValue('');
        // Keep focus
        inputRef.current?.focus();
    };

    const handleRemove = (labelToRemove: string) => {
        onChange(labels.filter(l => l !== labelToRemove));
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
        } else if (e.key === 'Backspace' && !inputValue && labels.length > 0) {
            // Remove last label on backspace if input empty
            handleRemove(labels[labels.length - 1]);
        }
    };

    return (
        <div ref={containerRef} className="relative inline-flex items-center">
            <div className="flex flex-wrap gap-2 items-center min-h-[24px]">
                {labels.map(label => (
                    <span
                        key={label}
                        className="inline-flex items-center gap-1 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 px-2.5 py-0.5 rounded-full text-xs font-medium transition-all hover:bg-primary-100 dark:hover:bg-primary-900/40 border border-primary-200 dark:border-primary-800/50"
                    >
                        {label}
                        {!readOnly && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleRemove(label); }}
                                className="hover:bg-primary-200 dark:hover:bg-primary-800 rounded-full p-0.5 focus:outline-none transition-colors"
                            >
                                <XMarkIcon className="h-3 w-3" />
                            </button>
                        )}
                    </span>
                ))}

                {!readOnly && !isEditing && (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="text-neutral-400 hover:text-primary-600 dark:text-neutral-500 dark:hover:text-primary-400 p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                        title="Add Label"
                    >
                        <PlusIcon className="h-4 w-4" />
                    </button>
                )}

                {!readOnly && isEditing && (
                    <div className="flex items-center animate-scale-in origin-left">
                        <input
                            ref={inputRef}
                            type="text"
                            className="w-40 text-xs border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 shadow-sm"
                            placeholder="Type label..."
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                    </div>
                )}
            </div>
            {labels.length === 0 && !isEditing && (
                <button onClick={() => setIsEditing(true)} className="text-xs text-neutral-400 italic hover:text-primary-500 transition-colors">
                    + Add label
                </button>
            )}
        </div>
    );
}
