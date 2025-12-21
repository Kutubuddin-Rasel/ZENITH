"use client";
import React from 'react';
import Input from './Input';
import {
    CalendarDaysIcon,
    LinkIcon,
    UserCircleIcon,
    CheckCircleIcon,
    HashtagIcon,
    Bars3BottomLeftIcon,
    ChevronDownIcon,
} from '@heroicons/react/24/outline';

/**
 * Custom Field Types matching backend CustomFieldType enum
 */
export type CustomFieldType =
    | 'text'
    | 'textarea'
    | 'number'
    | 'date'
    | 'select'
    | 'multi_select'
    | 'user'
    | 'url'
    | 'checkbox';

/**
 * Custom Field Definition from backend
 */
export interface CustomFieldDefinition {
    id: string;
    name: string;
    label?: string;
    type: CustomFieldType;
    description?: string;
    isRequired: boolean;
    config?: {
        options?: Array<{ value: string; label: string; color?: string }>;
        min?: number;
        max?: number;
        maxLength?: number;
        placeholder?: string;
    };
}

/**
 * Props for CustomFieldsEditor
 */
interface CustomFieldsEditorProps {
    fields: CustomFieldDefinition[];
    values: Record<string, unknown>;
    onChange: (fieldId: string, value: unknown) => void;
    disabled?: boolean;
    className?: string;
    users?: Array<{ id: string; name: string; email: string; avatarUrl?: string }>;
}

/**
 * CustomFieldsEditor - Renders dynamic custom fields for issues
 * 
 * Supports all 9 field types: text, textarea, number, date, 
 * select, multi_select, user, url, checkbox
 */
const CustomFieldsEditor: React.FC<CustomFieldsEditorProps> = ({
    fields,
    values,
    onChange,
    disabled = false,
    className = '',
    users = [],
}) => {
    if (!fields || fields.length === 0) {
        return null;
    }

    return (
        <div className={`space-y-4 ${className}`}>
            {fields.map((field) => (
                <CustomFieldInput
                    key={field.id}
                    field={field}
                    value={values[field.id]}
                    onChange={(val) => onChange(field.id, val)}
                    disabled={disabled}
                    users={users}
                />
            ))}
        </div>
    );
};

/**
 * Individual custom field input component
 */
interface CustomFieldInputProps {
    field: CustomFieldDefinition;
    value: unknown;
    onChange: (value: unknown) => void;
    disabled?: boolean;
    users?: Array<{ id: string; name: string; email: string; avatarUrl?: string }>;
}

const CustomFieldInput: React.FC<CustomFieldInputProps> = ({
    field,
    value,
    onChange,
    disabled,
    users = [],
}) => {
    const label = field.label || field.name;
    const placeholder = field.config?.placeholder || `Enter ${label.toLowerCase()}`;

    const renderInput = () => {
        switch (field.type) {
            case 'text':
                return (
                    <div className="relative">
                        <Bars3BottomLeftIcon className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                        <Input
                            value={(value as string) || ''}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder={placeholder}
                            disabled={disabled}
                            maxLength={field.config?.maxLength}
                            className="pl-9"
                        />
                    </div>
                );

            case 'textarea':
                return (
                    <textarea
                        value={(value as string) || ''}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={placeholder}
                        disabled={disabled}
                        maxLength={field.config?.maxLength}
                        rows={3}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-blue bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 disabled:opacity-50"
                    />
                );

            case 'number':
                return (
                    <div className="relative">
                        <HashtagIcon className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                        <Input
                            type="number"
                            value={(value as number) ?? ''}
                            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
                            placeholder={placeholder}
                            disabled={disabled}
                            min={field.config?.min}
                            max={field.config?.max}
                            className="pl-9"
                        />
                    </div>
                );

            case 'date':
                return (
                    <div className="relative">
                        <CalendarDaysIcon className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                        <Input
                            type="date"
                            value={(value as string) || ''}
                            onChange={(e) => onChange(e.target.value)}
                            disabled={disabled}
                            className="pl-9"
                        />
                    </div>
                );

            case 'url':
                return (
                    <div className="relative">
                        <LinkIcon className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
                        <Input
                            type="url"
                            value={(value as string) || ''}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder="https://..."
                            disabled={disabled}
                            className="pl-9"
                        />
                    </div>
                );

            case 'checkbox':
                return (
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={Boolean(value)}
                            onChange={(e) => onChange(e.target.checked)}
                            disabled={disabled}
                            className="h-5 w-5 rounded border-neutral-300 text-accent-blue focus:ring-accent-blue dark:border-neutral-600 dark:bg-neutral-800"
                        />
                        <span className="text-sm text-neutral-700 dark:text-neutral-300">
                            {field.description || label}
                        </span>
                    </label>
                );

            case 'select':
                return (
                    <div className="relative">
                        <select
                            value={(value as string) || ''}
                            onChange={(e) => onChange(e.target.value || null)}
                            disabled={disabled}
                            className="w-full px-4 py-2 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-blue bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 disabled:opacity-50 appearance-none cursor-pointer"
                        >
                            <option value="">Select {label.toLowerCase()}</option>
                            {field.config?.options?.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                        <ChevronDownIcon className="absolute right-3 top-2.5 h-5 w-5 text-neutral-400 pointer-events-none" />
                    </div>
                );

            case 'multi_select':
                const selectedValues = Array.isArray(value) ? (value as string[]) : [];
                return (
                    <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                            {field.config?.options?.map((opt) => {
                                const isSelected = selectedValues.includes(opt.value);
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => {
                                            if (isSelected) {
                                                onChange(selectedValues.filter((v) => v !== opt.value));
                                            } else {
                                                onChange([...selectedValues, opt.value]);
                                            }
                                        }}
                                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${isSelected
                                            ? 'bg-accent-blue text-white shadow-md'
                                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                                            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                        style={opt.color && isSelected ? { backgroundColor: opt.color } : undefined}
                                    >
                                        {isSelected && <CheckCircleIcon className="h-4 w-4 inline mr-1" />}
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                        {selectedValues.length > 0 && (
                            <p className="text-xs text-neutral-500">{selectedValues.length} selected</p>
                        )}
                    </div>
                );

            case 'user':
                return (
                    <div className="relative">
                        <UserCircleIcon className="absolute left-3 top-2.5 h-5 w-5 text-neutral-400" />
                        <select
                            value={(value as string) || ''}
                            onChange={(e) => onChange(e.target.value || null)}
                            disabled={disabled}
                            className="w-full px-4 py-2 pl-10 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-blue bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 disabled:opacity-50 appearance-none cursor-pointer"
                        >
                            <option value="">Select user</option>
                            {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.name || user.email}
                                </option>
                            ))}
                        </select>
                        <ChevronDownIcon className="absolute right-3 top-2.5 h-5 w-5 text-neutral-400 pointer-events-none" />
                    </div>
                );

            default:
                return (
                    <Input
                        value={String(value ?? '')}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={placeholder}
                        disabled={disabled}
                    />
                );
        }
    };

    // Don't show label for checkbox (it's inline)
    if (field.type === 'checkbox') {
        return <div className="py-1">{renderInput()}</div>;
    }

    return (
        <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                {label}
                {field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            {renderInput()}
            {field.description && (
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{field.description}</p>
            )}
        </div>
    );
};

export default CustomFieldsEditor;

/**
 * Hook to fetch and manage custom fields for an issue
 */
export function useCustomFields(projectId: string, issueId?: string) {
    const [fields, setFields] = React.useState<CustomFieldDefinition[]>([]);
    const [values, setValues] = React.useState<Record<string, unknown>>({});
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    // Fetch field definitions for project
    const fetchFields = React.useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/projects/${projectId}/custom-fields`, {
                credentials: 'include',
            });
            if (!response.ok) throw new Error('Failed to load custom fields');
            const data = await response.json();
            setFields(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    // Fetch values for issue
    const fetchValues = React.useCallback(async () => {
        if (!issueId) return;
        try {
            const response = await fetch(`/api/issues/${issueId}/custom-fields`, {
                credentials: 'include',
            });
            if (!response.ok) throw new Error('Failed to load custom field values');
            const data = await response.json();
            // Convert array to record
            const valuesRecord: Record<string, unknown> = {};
            if (Array.isArray(data)) {
                data.forEach((v: { fieldId: string; value: unknown }) => {
                    valuesRecord[v.fieldId] = v.value;
                });
            }
            setValues(valuesRecord);
        } catch (err) {
            console.error('Error loading custom field values:', err);
        }
    }, [issueId]);

    // Save values
    const saveValues = React.useCallback(async (newValues: Record<string, unknown>) => {
        if (!issueId) return;
        const payload = Object.entries(newValues).map(([fieldId, value]) => ({
            fieldId,
            value: String(value ?? ''),
        }));

        const response = await fetch(`/api/issues/${issueId}/custom-fields`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error('Failed to save custom field values');
        setValues(newValues);
    }, [issueId]);

    // Load on mount
    React.useEffect(() => {
        fetchFields();
    }, [fetchFields]);

    React.useEffect(() => {
        if (issueId) fetchValues();
    }, [issueId, fetchValues]);

    return {
        fields,
        values,
        setValues,
        saveValues,
        isLoading,
        error,
        refetch: () => {
            fetchFields();
            if (issueId) fetchValues();
        },
    };
}
