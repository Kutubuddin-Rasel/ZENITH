'use client';

import Link from "next/link";
import {
    ArrowRightIcon,
    SparklesIcon,
} from "@heroicons/react/24/outline";
import {
    HeroStaggerContainer,
    StaggerItem,
    StaggerContainer,
} from '@/components/ui/motion';

// Feature card type
// Feature card type
interface FeatureCard {
    id: string;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }> | React.ForwardRefExoticComponent<unknown>;
    gradient: string;
    tags?: readonly string[];
    className?: string;
    isLarge: boolean;
    bgVariant?: 'neutral' | 'gradient-subtle';
}

import { FEATURE_CARDS, TRUST_BADGES } from "../../constants/landing-data";

export default function Hero() {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 sm:pt-32 sm:pb-24">
            {/* Hero Content with staggered entrance animation */}
            <HeroStaggerContainer delay={0.1} staggerDelay={0.15} className="text-center mb-16">
                {/* Badge */}
                <StaggerItem>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-100/80 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium mb-8 backdrop-blur-sm border border-primary-200/50 dark:border-primary-800/50">
                        <SparklesIcon className="h-4 w-4" />
                        Trusted by 10,000+ Teams Worldwide
                    </div>
                </StaggerItem>

                {/* Headline */}
                <StaggerItem>
                    <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-8 tracking-tight">
                        <span className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 dark:from-white dark:via-neutral-100 dark:to-white bg-clip-text text-transparent">
                            Ship projects
                        </span>
                        <br />
                        <span className="bg-gradient-to-r from-primary-600 via-primary-500 to-primary-600 bg-clip-text text-transparent">
                            2x faster
                        </span>
                    </h1>
                </StaggerItem>

                {/* Subheadline */}
                <StaggerItem>
                    <p className="text-xl sm:text-2xl text-neutral-600 dark:text-neutral-400 max-w-3xl mx-auto mb-12 leading-relaxed">
                        The complete agile platform trusted by engineering teams. Save 10+ hours per week with powerful sprint planning, issue tracking, and seamless collaboration.
                    </p>
                </StaggerItem>

                {/* CTA Buttons */}
                <StaggerItem>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-20">
                        <Link
                            href="/auth/register"
                            className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-primary-600 text-accent-foreground font-semibold hover:bg-primary-700 transition-all shadow-lg hover:shadow-xl hover:scale-105"
                        >
                            Create Workspace
                            <ArrowRightIcon className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <a
                            href="#features"
                            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl border-2 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-semibold hover:border-primary-400 dark:hover:border-primary-600 hover:text-primary-600 dark:hover:text-primary-400 transition-all"
                        >
                            See How It Works
                        </a>
                    </div>
                </StaggerItem>

                {/* Trust Badges */}
                <StaggerItem>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-8 text-sm text-neutral-600 dark:text-neutral-400">
                        {TRUST_BADGES.map((badge) => (
                            <div key={badge.text} className="flex items-center gap-2">
                                <badge.icon className={`h-5 w-5 ${badge.color}`} />
                                <span>{badge.text}</span>
                            </div>
                        ))}
                    </div>
                </StaggerItem>
            </HeroStaggerContainer>

            {/* Bento Grid with scroll reveal */}
            <StaggerContainer delay={0.2} staggerDelay={0.1} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-20">
                {(FEATURE_CARDS as unknown as FeatureCard[]).map((card) => (
                    <StaggerItem key={card.id} className={card.className}>
                        {card.isLarge ? (
                            <LargeFeatureCard {...card} />
                        ) : card.bgVariant === 'gradient-subtle' ? (
                            <WideFeatureCard {...card} />
                        ) : (
                            <SmallFeatureCard {...card} bgVariant={card.bgVariant} />
                        )}
                    </StaggerItem>
                ))}
            </StaggerContainer>
        </div>
    );
}

// ============================================================================
// Feature Card Components - Extracted for cleaner code
// ============================================================================

interface FeatureCardProps {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    gradient: string;
    tags?: readonly string[];
}

function LargeFeatureCard({ title, description, icon: Icon, gradient, tags }: FeatureCardProps) {
    return (
        <div className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-8 shadow-xl hover:shadow-2xl transition-all h-full`}>
            <div className="relative z-10">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-6">
                    <Icon className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">{title}</h3>
                <p className="text-primary-100 text-lg mb-6 leading-relaxed">{description}</p>
                {tags && (
                    <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => (
                            <span key={tag} className="px-3 py-1 rounded-lg bg-white/20 backdrop-blur-sm text-white text-sm font-medium">
                                {tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>
            <div className="absolute bottom-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
        </div>
    );
}

function SmallFeatureCard({ title, description, icon: Icon, gradient, bgVariant }: FeatureCardProps & { bgVariant?: string }) {
    const bgClass = bgVariant === 'neutral'
        ? 'bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900 border border-neutral-200 dark:border-neutral-700'
        : 'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800';

    return (
        <div className={`group relative overflow-hidden rounded-2xl ${bgClass} p-6 hover:shadow-lg transition-all hover:-translate-y-1`}>
            <div className={`w-12 h-12 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <Icon className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">{title}</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{description}</p>
        </div>
    );
}

function WideFeatureCard({ title, description, icon: Icon, gradient, tags }: FeatureCardProps) {
    return (
        <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-neutral-50 to-primary-50/30 dark:from-neutral-900 dark:to-primary-950/30 border border-neutral-200 dark:border-neutral-800 p-6 hover:shadow-lg transition-all">
            <div className="flex items-start gap-4">
                <div className={`w-12 h-12 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                    <Icon className="h-6 w-6 text-white" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">{title}</h3>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed mb-3">{description}</p>
                    {tags && (
                        <div className="flex gap-2">
                            {tags.map((tag) => (
                                <span key={tag} className="px-3 py-1 rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
