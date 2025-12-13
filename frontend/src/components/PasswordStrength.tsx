'use client';
import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface PasswordStrengthProps {
    password: string;
    showRequirements?: boolean;
}

interface Requirement {
    label: string;
    met: boolean;
}

export default function PasswordStrength({ password, showRequirements = true }: PasswordStrengthProps) {
    // Check individual requirements
    const requirements: Requirement[] = [
        { label: '8+ characters', met: password.length >= 8 },
        { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
        { label: 'Number', met: /\d/.test(password) },
        { label: 'Special character', met: /[^A-Za-z0-9]/.test(password) },
    ];

    const calculateStrength = (pwd: string): number => {
        if (!pwd) return 0;

        let strength = 0;

        // Length check
        if (pwd.length >= 8) strength++;
        if (pwd.length >= 12) strength++;

        // Character variety checks
        if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength++;
        if (/\d/.test(pwd)) strength++;
        if (/[^A-Za-z0-9]/.test(pwd)) strength++;

        return Math.min(strength, 4);
    };

    const strength = calculateStrength(password);

    const getStrengthLabel = (str: number): string => {
        if (str === 0) return '';
        if (str === 1) return 'Weak';
        if (str === 2) return 'Fair';
        if (str === 3) return 'Good';
        return 'Strong';
    };

    const getStrengthColor = (index: number, str: number): string => {
        if (index >= str) return 'bg-neutral-200 dark:bg-neutral-700';
        if (str === 1) return 'bg-error-500';
        if (str === 2) return 'bg-warning-500';
        if (str === 3) return 'bg-primary-500';
        return 'bg-success-500';
    };

    const getLabelColor = (str: number): string => {
        if (str === 1) return 'text-error-600 dark:text-error-400';
        if (str === 2) return 'text-warning-600 dark:text-warning-400';
        if (str === 3) return 'text-primary-600 dark:text-primary-400';
        if (str >= 4) return 'text-success-600 dark:text-success-400';
        return 'text-neutral-500';
    };

    if (!password) return null;

    return (
        <div className="mt-2 space-y-2">
            {/* Strength Bars */}
            <div className="flex gap-1">
                {[0, 1, 2, 3].map((index) => (
                    <motion.div
                        key={index}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{
                            duration: 0.3,
                            delay: index * 0.05,
                            type: 'spring',
                            stiffness: 200
                        }}
                        className={`h-1.5 flex-1 rounded-full origin-left transition-colors duration-300 ${getStrengthColor(index, strength)}`}
                    />
                ))}
            </div>

            {/* Strength Label */}
            {strength > 0 && (
                <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        Password strength:
                    </span>
                    <motion.span
                        key={strength}
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`text-xs font-semibold ${getLabelColor(strength)}`}
                    >
                        {getStrengthLabel(strength)}
                    </motion.span>
                </div>
            )}

            {/* Requirements Checklist */}
            {showRequirements && password.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="flex flex-wrap gap-x-4 gap-y-1 pt-1"
                >
                    {requirements.map((req, index) => (
                        <motion.div
                            key={req.label}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="flex items-center gap-1"
                        >
                            {req.met ? (
                                <CheckCircleIcon className="h-3.5 w-3.5 text-success-500" />
                            ) : (
                                <XCircleIcon className="h-3.5 w-3.5 text-neutral-400" />
                            )}
                            <span className={`text-xs ${req.met
                                    ? 'text-success-600 dark:text-success-400'
                                    : 'text-neutral-500 dark:text-neutral-400'
                                }`}>
                                {req.label}
                            </span>
                        </motion.div>
                    ))}
                </motion.div>
            )}
        </div>
    );
}
