'use client';

// import {
//     RocketLaunchIcon,
//     CodeBracketIcon,
//     ChartBarIcon,
// } from "@heroicons/react/24/outline";
import { ScrollReveal, StaggerContainer, StaggerItem, fadeInUp } from '@/components/ui/motion';

import { FEATURES } from "../../constants/landing-data";

export default function Features() {
    return (
        <div id="features" className="relative bg-neutral-50/50 dark:bg-neutral-900/50 py-24 border-y border-neutral-200/50 dark:border-neutral-800/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Section Header with scroll reveal */}
                <ScrollReveal className="text-center mb-16">
                    <h2 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-white dark:to-neutral-300 bg-clip-text text-transparent mb-4">
                        Built for speed and scale
                    </h2>
                    <p className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto">
                        Everything your team needs to ship projects faster
                    </p>
                </ScrollReveal>

                {/* Feature Cards with staggered reveal */}
                <StaggerContainer staggerDelay={0.15} className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {FEATURES.map((feature) => (
                        <StaggerItem key={feature.id} variants={fadeInUp}>
                            <div className="text-center">
                                <div className={`w-16 h-16 bg-gradient-to-br ${feature.gradient} rounded-2xl flex items-center justify-center mx-auto mb-4 ${feature.rotation} transition-transform`}>
                                    <feature.icon className="h-8 w-8 text-white" />
                                </div>
                                <h3 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
                                    {feature.title}
                                </h3>
                                <p className="text-neutral-600 dark:text-neutral-400">
                                    {feature.description}
                                </p>
                            </div>
                        </StaggerItem>
                    ))}
                </StaggerContainer>
            </div>
        </div>
    );
}
