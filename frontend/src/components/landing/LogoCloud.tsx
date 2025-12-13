'use client';

import { ScrollReveal, StaggerContainer, StaggerItem, scaleIn } from '@/components/ui/motion';

// Logo cloud data
const COMPANIES = [
    { name: 'TechCorp', initials: 'TC' },
    { name: 'StartupXYZ', initials: 'SX' },
    { name: 'DevTeam Inc', initials: 'DT' },
    { name: 'CloudScale', initials: 'CS' },
    { name: 'AgileFlow', initials: 'AF' },
    { name: 'CodeForge', initials: 'CF' },
] as const;

export default function LogoCloud() {
    return (
        <div className="relative py-12 border-y border-neutral-200/50 dark:border-neutral-800/50 bg-white dark:bg-neutral-950">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <ScrollReveal>
                    <p className="text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-8">
                        Trusted by engineering teams at
                    </p>
                </ScrollReveal>

                <StaggerContainer staggerDelay={0.08} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 items-center">
                    {COMPANIES.map((company) => (
                        <StaggerItem key={company.name} variants={scaleIn} className="flex justify-center">
                            <div className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity">
                                <div className="w-8 h-8 bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 rounded-lg flex items-center justify-center">
                                    <span className="text-xs font-bold text-neutral-600 dark:text-neutral-400">{company.initials}</span>
                                </div>
                                <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">{company.name}</span>
                            </div>
                        </StaggerItem>
                    ))}
                </StaggerContainer>
            </div>
        </div>
    );
}
