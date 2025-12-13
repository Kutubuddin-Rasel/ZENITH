'use client';

import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { ScrollReveal } from '@/components/ui/motion';

export default function CTASection() {
    return (
        <div className="relative bg-gradient-to-br from-primary-600 via-primary-600 to-primary-700 py-24 overflow-hidden">
            {/* Grid background pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

            <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                <ScrollReveal>
                    <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
                        Ready to ship faster?
                    </h2>
                </ScrollReveal>

                <ScrollReveal delay={0.1}>
                    <p className="text-xl text-primary-100 mb-10 max-w-2xl mx-auto">
                        Join 10,000+ teams using Zenith to plan sprints, track issues, and deliver better software.
                    </p>
                </ScrollReveal>

                <ScrollReveal delay={0.2}>
                    <Link
                        href="/auth/register"
                        className="group inline-flex items-center gap-2 px-10 py-4 rounded-xl bg-white text-primary-600 font-semibold hover:bg-primary-50 transition-all shadow-xl hover:shadow-2xl hover:scale-105"
                    >
                        Create Your Workspace
                        <ArrowRightIcon className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </Link>
                </ScrollReveal>

                <ScrollReveal delay={0.3}>
                    <p className="mt-6 text-primary-100 text-sm">No credit card required • Free 14-day trial</p>
                </ScrollReveal>
            </div>
        </div>
    );
}
