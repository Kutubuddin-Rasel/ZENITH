// lib/drag-physics.ts
// Premium spring physics configuration for Apple-like drag experience

import { defaultDropAnimationSideEffects, DropAnimation } from '@dnd-kit/core';

/**
 * Spring configuration for heavy, quality card feel
 * - High stiffness = quick response to input
 * - Moderate damping = slight overshoot, then settle
 * - Slightly heavy mass = perceptible weight
 */
export const ZENITH_SPRING = {
    type: 'spring' as const,
    stiffness: 400,
    damping: 30,
    mass: 0.8,
};

/**
 * Micro-interaction for card "lift" when grabbed
 * Creates the feeling of picking up a physical card
 */
export const LIFT_ANIMATION = {
    scale: 1.05,
    rotate: 3,
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    transition: {
        type: 'spring' as const,
        stiffness: 500,
        damping: 25,
    },
};

/**
 * List-specific lift animation with smaller scale
 * Prevents aggressive overlap with neighboring items in vertical lists
 */
export const LIST_LIFT_ANIMATION = {
    scale: 1.02,
    rotate: 1,
    boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.2)',
    transition: {
        type: 'spring' as const,
        stiffness: 500,
        damping: 25,
    },
};

/**
 * Animation when card is dropped into place
 * Slight bounce effect for satisfying placement
 */
export const DROP_ANIMATION: DropAnimation = {
    duration: 250,
    easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)', // Slight bounce
    sideEffects: defaultDropAnimationSideEffects({
        styles: {
            active: { opacity: '0.4' },
        },
    }),
};

/**
 * Rest state (no animation)
 */
export const REST_ANIMATION = {
    scale: 1,
    rotate: 0,
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
};

/**
 * Hover state for subtle interactivity hint
 */
export const HOVER_ANIMATION = {
    scale: 1.02,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    transition: {
        type: 'spring' as const,
        stiffness: 300,
        damping: 20,
    },
};

/**
 * Pointer sensor activation constraint
 * Prevents accidental drags from clicks
 */
export const DRAG_ACTIVATION_CONSTRAINT = {
    distance: 8, // 8px movement required to start drag
};
