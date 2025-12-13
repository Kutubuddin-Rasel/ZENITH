'use client';

import { ScrollReveal, StaggerContainer, StaggerItem, fadeInUp } from '@/components/ui/motion';

// Testimonial data
import { TESTIMONIALS } from "../../constants/landing-data";

// Star rating component
function StarRating() {
    return (
        <div className="flex gap-1 mb-4">
            {[...Array(5)].map((_, j) => (
                <svg key={j} className="w-4 h-4 text-warning-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
            ))}
        </div>
    );
}

// Get initials from name
function getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('');
}

export default function Testimonials() {
    return (
        <div className="relative py-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Section Header */}
                <ScrollReveal className="text-center mb-16">
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-white dark:to-neutral-300 bg-clip-text text-transparent mb-4">
                        Loved by teams worldwide
                    </h2>
                    <p className="text-lg text-neutral-600 dark:text-neutral-400">
                        Join thousands of engineering teams shipping better software
                    </p>
                </ScrollReveal>

                {/* Testimonial Cards with staggered animation */}
                <StaggerContainer staggerDelay={0.12} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {TESTIMONIALS.map((testimonial) => (
                        <StaggerItem key={testimonial.id} variants={fadeInUp}>
                            <div className="group p-6 rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:shadow-lg transition-all hover:-translate-y-1 h-full">
                                <StarRating />
                                <p className="text-neutral-700 dark:text-neutral-300 mb-4 leading-relaxed">
                                    &quot;{testimonial.quote}&quot;
                                </p>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-semibold">
                                        {getInitials(testimonial.name)}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-neutral-900 dark:text-white">{testimonial.name}</p>
                                        <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                            {testimonial.role}, {testimonial.company}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </StaggerItem>
                    ))}
                </StaggerContainer>
            </div>
        </div>
    );
}
