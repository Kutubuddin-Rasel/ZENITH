'use client';

import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { ScrollReveal } from '@/components/ui/motion';

// Comparison table data
const COMPARISON_DATA = [
    { feature: 'Modern Tech Stack (TypeScript, Next.js)', zenith: true, jira: false, linear: true, trello: false },
    { feature: 'Custom Workflows', zenith: true, jira: true, linear: false, trello: false },
    { feature: 'Resource Management', zenith: true, jira: false, linear: false, trello: false },
    { feature: 'Sprint Planning & Burndown', zenith: true, jira: true, linear: true, trello: false },
    { feature: '2FA & SSO (SAML)', zenith: true, jira: true, linear: true, trello: true },
    { feature: 'Self-Hostable', zenith: true, jira: true, linear: false, trello: false },
    { feature: 'Automation Rules', zenith: true, jira: true, linear: false, trello: false },
    { feature: 'API Access', zenith: true, jira: true, linear: true, trello: true },
] as const;

function CheckIcon({ success }: { success: boolean }) {
    if (success) {
        return (
            <div className="flex justify-center">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
            </div>
        );
    }
    return (
        <div className="flex justify-center">
            <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </div>
        </div>
    );
}

function CompetitorCheck({ success }: { success: boolean }) {
    return success ? (
        <svg className="w-5 h-5 text-green-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
    ) : (
        <svg className="w-5 h-5 text-neutral-300 dark:text-neutral-700 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
    );
}

export default function ComparisonTable() {
    return (
        <div className="relative py-24 bg-white dark:bg-neutral-950">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Section Header */}
                <ScrollReveal className="text-center mb-16">
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-white dark:to-neutral-300 bg-clip-text text-transparent mb-4">
                        Why teams choose Zenith
                    </h2>
                    <p className="text-lg text-neutral-600 dark:text-neutral-400">
                        Modern technology with enterprise features, without the complexity
                    </p>
                </ScrollReveal>

                <ScrollReveal delay={0.2}>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b-2 border-neutral-200 dark:border-neutral-800">
                                    <th className="text-left py-4 px-4 text-sm font-semibold text-neutral-900 dark:text-white">Feature</th>
                                    <th className="py-4 px-4 text-center">
                                        <div className="flex flex-col items-center">
                                            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center mb-2">
                                                <span className="text-white font-bold text-xl">Z</span>
                                            </div>
                                            <span className="text-sm font-bold text-neutral-900 dark:text-white">Zenith</span>
                                        </div>
                                    </th>
                                    <th className="py-4 px-4 text-center text-sm font-medium text-neutral-600 dark:text-neutral-400">Jira</th>
                                    <th className="py-4 px-4 text-center text-sm font-medium text-neutral-600 dark:text-neutral-400">Linear</th>
                                    <th className="py-4 px-4 text-center text-sm font-medium text-neutral-600 dark:text-neutral-400">Trello</th>
                                </tr>
                            </thead>
                            <tbody>
                                {COMPARISON_DATA.map((row, index) => (
                                    <tr key={index} className="border-b border-neutral-100 dark:border-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
                                        <td className="py-4 px-4 text-sm text-neutral-700 dark:text-neutral-300">{row.feature}</td>
                                        <td className="py-4 px-4 text-center"><CheckIcon success={row.zenith} /></td>
                                        <td className="py-4 px-4 text-center"><CompetitorCheck success={row.jira} /></td>
                                        <td className="py-4 px-4 text-center"><CompetitorCheck success={row.linear} /></td>
                                        <td className="py-4 px-4 text-center"><CompetitorCheck success={row.trello} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ScrollReveal>

                <ScrollReveal delay={0.3} className="mt-10 text-center">
                    <Link
                        href="/auth/register"
                        className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 transition-all shadow-lg hover:shadow-xl hover:scale-105"
                    >
                        Start Free Trial
                        <ArrowRightIcon className="h-5 w-5" />
                    </Link>
                </ScrollReveal>
            </div>
        </div>
    );
}
