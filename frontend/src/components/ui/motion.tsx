'use client';

import { motion, useInView, Variants, HTMLMotionProps } from 'framer-motion';
import { useRef, ReactNode } from 'react';

// ============================================================================
// Animation Variants - Reusable motion configurations
// ============================================================================

export const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
};

export const fadeInDown: Variants = {
    hidden: { opacity: 0, y: -20 },
    visible: { opacity: 1, y: 0 },
};

export const fadeIn: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
};

export const scaleIn: Variants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1 },
};

export const slideInLeft: Variants = {
    hidden: { opacity: 0, x: -30 },
    visible: { opacity: 1, x: 0 },
};

export const slideInRight: Variants = {
    hidden: { opacity: 0, x: 30 },
    visible: { opacity: 1, x: 0 },
};

// Stagger container for child animations
export const staggerContainer: Variants = {
    hidden: { opacity: 1 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.1,
        },
    },
};

export const staggerContainerFast: Variants = {
    hidden: { opacity: 1 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05,
            delayChildren: 0.05,
        },
    },
};

// ============================================================================
// Transition Presets
// ============================================================================

export const springTransition = {
    type: 'spring',
    stiffness: 100,
    damping: 15,
} as const;

export const easeOutTransition = {
    duration: 0.5,
    ease: [0.25, 0.46, 0.45, 0.94],
} as const;

export const quickTransition = {
    duration: 0.3,
    ease: 'easeOut',
} as const;

// ============================================================================
// Animation Components - Scroll-triggered and entrance animations
// ============================================================================

interface ScrollRevealProps extends HTMLMotionProps<'div'> {
    children: ReactNode;
    variants?: Variants;
    delay?: number;
    once?: boolean;
    amount?: number;
    className?: string;
}

/**
 * ScrollReveal - Animates children when they enter the viewport
 * Uses IntersectionObserver for performance
 */
export function ScrollReveal({
    children,
    variants = fadeInUp,
    delay = 0,
    once = true,
    amount = 0.2,
    className,
    ...props
}: ScrollRevealProps) {
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once, amount });

    return (
        <motion.div
            ref={ref}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
            variants={variants}
            transition={{ ...easeOutTransition, delay }}
            className={className}
            {...props}
        >
            {children}
        </motion.div>
    );
}

interface StaggerContainerProps extends HTMLMotionProps<'div'> {
    children: ReactNode;
    delay?: number;
    staggerDelay?: number;
    once?: boolean;
    amount?: number;
    className?: string;
}

/**
 * StaggerContainer - Animates children with staggered timing
 */
export function StaggerContainer({
    children,
    delay = 0,
    staggerDelay = 0.1,
    once = true,
    amount = 0.2,
    className,
    ...props
}: StaggerContainerProps) {
    const ref = useRef<HTMLDivElement>(null);
    const isInView = useInView(ref, { once, amount });

    return (
        <motion.div
            ref={ref}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
            variants={{
                hidden: { opacity: 1 },
                visible: {
                    opacity: 1,
                    transition: {
                        staggerChildren: staggerDelay,
                        delayChildren: delay,
                    },
                },
            }}
            className={className}
            {...props}
        >
            {children}
        </motion.div>
    );
}

/**
 * StaggerItem - Child of StaggerContainer, animates with parent timing
 */
export function StaggerItem({
    children,
    variants = fadeInUp,
    className,
    ...props
}: ScrollRevealProps) {
    return (
        <motion.div
            variants={variants}
            transition={easeOutTransition}
            className={className}
            {...props}
        >
            {children}
        </motion.div>
    );
}

interface HeroEntranceProps extends HTMLMotionProps<'div'> {
    children: ReactNode;
    delay?: number;
    className?: string;
}

/**
 * HeroEntrance - Optimized entrance animation for hero sections
 * Uses immediate animation (not scroll-triggered) with stagger
 */
export function HeroEntrance({
    children,
    delay = 0,
    className,
    ...props
}: HeroEntranceProps) {
    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeInUp}
            transition={{ ...springTransition, delay }}
            className={className}
            {...props}
        >
            {children}
        </motion.div>
    );
}

/**
 * HeroStaggerContainer - Container for staggered hero animations
 */
export function HeroStaggerContainer({
    children,
    delay = 0,
    staggerDelay = 0.1,
    className,
    ...props
}: StaggerContainerProps) {
    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={{
                hidden: { opacity: 1 },
                visible: {
                    opacity: 1,
                    transition: {
                        staggerChildren: staggerDelay,
                        delayChildren: delay,
                    },
                },
            }}
            className={className}
            {...props}
        >
            {children}
        </motion.div>
    );
}
