import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AuthBackground } from './AuthBackground';
import { ShieldCheckIcon, UsersIcon, ClockIcon } from '@heroicons/react/24/outline';

interface AuthLayoutProps {
    children: React.ReactNode;
    title: string;
    subtitle: string;
}

// Trust badges for the left panel
const TRUST_BADGES = [
    { icon: ShieldCheckIcon, label: 'Enterprise Security' },
    { icon: UsersIcon, label: '10,000+ Teams' },
    { icon: ClockIcon, label: '99.9% Uptime' },
];

// Animation variants
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.15,
            delayChildren: 0.2,
        },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { type: 'spring' as const, stiffness: 100, damping: 15 }
    },
};

const formVariants = {
    hidden: { opacity: 0, x: 20 },
    visible: {
        opacity: 1,
        x: 0,
        transition: { type: 'spring' as const, stiffness: 80, damping: 20, delay: 0.3 }
    },
};

export default function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
    return (
        <div className="h-screen w-full flex bg-neutral-50 dark:bg-neutral-950 font-sans selection:bg-primary-500/30 overflow-hidden">
            {/* Left Side - Hero/Art (Desktop Only) */}
            <div className="hidden lg:flex lg:w-1/2 relative h-full bg-neutral-900 border-r border-neutral-800">
                <AuthBackground />
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="relative z-10 w-full h-full flex flex-col justify-between p-12 text-white"
                >
                    {/* Logo - Clickable */}
                    <motion.div variants={itemVariants}>
                        <Link href="/" className="flex items-center gap-3 group hover:opacity-90 transition-opacity">
                            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-900/30 group-hover:shadow-xl group-hover:shadow-primary-900/40 transition-shadow">
                                <span className="text-white font-bold text-xl leading-none">Z</span>
                            </div>
                            <span className="text-2xl font-bold tracking-tight">Zenith PM</span>
                        </Link>
                    </motion.div>

                    {/* Main Content */}
                    <div className="max-w-md space-y-8">
                        <motion.h2
                            variants={itemVariants}
                            className="text-5xl font-bold leading-tight tracking-tight"
                        >
                            <span className="block bg-gradient-to-r from-primary-400 to-primary-300 bg-clip-text text-transparent">Build faster,</span>
                            <span className="bg-gradient-to-r from-primary-400 to-primary-300 bg-clip-text text-transparent">
                                together.
                            </span>
                        </motion.h2>
                        <motion.p
                            variants={itemVariants}
                            className="text-lg text-neutral-400 leading-relaxed"
                        >
                            Join thousands of teams who use Zenith to plan, track, and release great software.
                        </motion.p>

                        {/* Trust Badges */}
                        <motion.div
                            variants={itemVariants}
                            className="flex flex-wrap gap-4 pt-4"
                        >
                            {TRUST_BADGES.map((badge, index) => (
                                <motion.div
                                    key={badge.label}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.5 + index * 0.1 }}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 backdrop-blur-sm border border-white/10"
                                >
                                    <badge.icon className="h-4 w-4 text-primary-400" />
                                    <span className="text-sm text-neutral-300">{badge.label}</span>
                                </motion.div>
                            ))}
                        </motion.div>
                    </div>

                    {/* Footer */}
                    <motion.div
                        variants={itemVariants}
                        className="flex gap-6 text-sm font-medium text-neutral-500"
                    >
                        <span>© {new Date().getFullYear()} Zenith Inc.</span>
                        <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
                        <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
                    </motion.div>
                </motion.div>
            </div>

            {/* Right Side - Form */}
            <div className="w-full lg:w-1/2 h-full overflow-y-auto flex items-center justify-center p-4 sm:p-8 relative bg-white dark:bg-neutral-950">
                {/* Mobile Background Texture (Subtle) */}
                <div className="lg:hidden absolute inset-0 z-0 overflow-hidden">
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-500/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
                    <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-primary-400/5 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/2" />
                </div>

                <motion.div
                    variants={formVariants}
                    initial="hidden"
                    animate="visible"
                    className="w-full max-w-[420px] relative z-10 py-12"
                >
                    {/* Mobile Logo */}
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="lg:hidden flex justify-center mb-8"
                    >
                        <Link href="/" className="flex items-center gap-2 group">
                            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
                                <span className="text-white font-bold text-xl leading-none">Z</span>
                            </div>
                            <span className="text-2xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-white dark:to-neutral-300 bg-clip-text text-transparent">
                                Zenith PM
                            </span>
                        </Link>
                    </motion.div>

                    {/* Form Container */}
                    <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl lg:backdrop-blur-none lg:bg-transparent border lg:border-none border-neutral-200/50 dark:border-neutral-800/50 shadow-2xl lg:shadow-none rounded-2xl p-8 lg:p-0">
                        {/* Header */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="text-center lg:text-left mb-8"
                        >
                            <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2 tracking-tight">
                                {title}
                            </h1>
                            <p className="text-base text-neutral-500 dark:text-neutral-400">
                                {subtitle}
                            </p>
                        </motion.div>

                        {/* Form Content */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.5 }}
                        >
                            {children}
                        </motion.div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
