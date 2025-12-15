'use client';

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle, Zap } from "lucide-react"; // Using lucide-react as in Figma check
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";


// Fallback for cn if required, but standard sets usually have it. 
// I'll check for it later, or just define it inline if I want to be safe.
// Checking previous view_file of page.tsx didn't show imports from @/lib/utils but standard Next.js setup usually has it.
// I'll use explicit standard classes for now to be safe, or inline logic.

function TaskCard({ title, tag, tagColor, assignee, color }: { title: string, tag: string, tagColor: string, assignee: string, color?: string }) {
    return (
        <div className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-lg p-3 border border-neutral-200 dark:border-neutral-800 shadow-sm mb-3">
            <div className="flex items-start justify-between mb-2">
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{title}</span>
            </div>
            <div className="flex items-center justify-between mt-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${tagColor}`}>
                    {tag}
                </span>
                <div className={`w-6 h-6 rounded-full ${color || 'bg-blue-600'} text-white text-[10px] flex items-center justify-center font-bold ring-2 ring-white dark:ring-neutral-900`}>
                    {assignee}
                </div>
            </div>
        </div>
    );
}

export default function ModernHero() {
    const containerRef = useRef<HTMLDivElement>(null);

    // Mouse position state for 3D tilt
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseXSpring = useSpring(x);
    const mouseYSpring = useSpring(y);

    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["12deg", "-12deg"]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-8deg", "8deg"]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const width = rect.width;
        const height = rect.height;

        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const xPct = mouseX / width - 0.5;
        const yPct = mouseY / height - 0.5;

        x.set(xPct);
        y.set(yPct);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    return (
        <section className="relative pt-32 pb-20 px-6 overflow-hidden bg-white dark:bg-neutral-950">
            {/* Background Gradients */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-blue-50/50 to-transparent dark:from-blue-950/20 pointer-events-none" />
            <div className="absolute -top-[200px] -right-[200px] w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="max-w-7xl mx-auto relative z-10">
                {/* Text Content */}
                <div className="text-center mb-20">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-medium mb-8 border border-blue-100 dark:border-blue-800"
                    >
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                        New: AI Smart Setup
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                        className="text-6xl md:text-7xl font-bold tracking-tight mb-6 text-neutral-900 dark:text-white"
                    >
                        Ship projects <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">2x faster</span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto mb-10 leading-relaxed"
                    >
                        The complete agile platform for modern engineering teams.
                        Save 10+ hours per week with powerful sprint planning and AI workspaces.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4"
                    >
                        <Link href="/auth/register" className="px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-blue-500/25 flex items-center gap-2 font-semibold">
                            Create Workspace
                            <ArrowRight className="w-5 h-5" />
                        </Link>
                        <Link href="#features" className="px-8 py-4 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 rounded-xl hover:border-neutral-300 dark:hover:border-neutral-700 transition-all font-semibold">
                            See How It Works
                        </Link>
                    </motion.div>
                </div>

                {/* 3D Dashboard Mockup */}
                <motion.div
                    ref={containerRef}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                    className="relative max-w-5xl mx-auto perspective-1000"
                    style={{ perspective: "1200px" }}
                >
                    <motion.div
                        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
                        className="relative bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl dark:shadow-blue-900/10 overflow-hidden"
                    >
                        {/* Fake Browser Toolbar */}
                        <div className="bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-4 py-3 flex items-center gap-2">
                            <div className="flex gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-400/80" />
                                <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
                                <div className="w-3 h-3 rounded-full bg-green-400/80" />
                            </div>
                            <div className="ml-4 px-3 py-1 bg-white dark:bg-neutral-800 rounded-md text-xs text-neutral-400 flex-1 max-w-[200px] border border-neutral-100 dark:border-neutral-700 text-center">
                                zenith.pm/dashboard
                            </div>
                        </div>

                        {/* Dashboard Content */}
                        <div className="p-6 bg-neutral-50/50 dark:bg-neutral-950/50 grid grid-cols-12 gap-6 h-[500px]">
                            {/* Sidebar */}
                            <div className="col-span-2 border-r border-neutral-200 dark:border-neutral-800 pr-4 hidden md:block">
                                <div className="h-8 w-24 bg-neutral-200 dark:bg-neutral-800 rounded mb-8" />
                                <div className="space-y-3">
                                    {[1, 2, 3, 4, 5].map(i => (
                                        <div key={i} className="h-4 w-full bg-neutral-100 dark:bg-neutral-800/50 rounded" />
                                    ))}
                                </div>
                            </div>

                            {/* Main Board */}
                            <div className="col-span-12 md:col-span-10">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-lg font-bold text-neutral-900 dark:text-white">Sprint Board</h3>
                                    <div className="flex -space-x-2">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-800 border-2 border-white dark:border-neutral-900" />
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    {/* Todo Column */}
                                    <div className="bg-neutral-100/50 dark:bg-neutral-900 rounded-xl p-4">
                                        <div className="flex justify-between mb-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                                            <span>To Do</span>
                                            <span>3</span>
                                        </div>
                                        <TaskCard title="Fix API Latency" tag="Bug" tagColor="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" assignee="JD" color="bg-purple-600" />
                                        <TaskCard title="Update Docs" tag="Docs" tagColor="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" assignee="AL" color="bg-orange-600" />
                                        <TaskCard title="Q3 Review" tag="Planning" tagColor="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" assignee="MK" color="bg-cyan-600" />
                                    </div>

                                    {/* In Progress Column */}
                                    <div className="bg-neutral-100/50 dark:bg-neutral-900 rounded-xl p-4">
                                        <div className="flex justify-between mb-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                                            <span>In Progress</span>
                                            <span>2</span>
                                        </div>
                                        <div className="relative group">
                                            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg blur opacity-30 group-hover:opacity-60 transition duration-200" />
                                            <div className="relative">
                                                <TaskCard title="Integrate Stripe" tag="Feature" tagColor="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" assignee="ME" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Done Column */}
                                    <div className="bg-neutral-100/50 dark:bg-neutral-900 rounded-xl p-4">
                                        <div className="flex justify-between mb-4 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                                            <span>Done</span>
                                            <span>5</span>
                                        </div>
                                        <TaskCard title="Login Flow" tag="Feature" tagColor="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" assignee="RK" color="bg-green-600" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Floating Elements (3D Popout) */}
                        <div className="absolute -right-12 top-20 bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-xl border border-neutral-100 dark:border-neutral-700 animate-float" style={{ transform: "translateZ(50px)" }}>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                                </div>
                                <div>
                                    <div className="text-xs text-neutral-500 font-medium">Sprint Goal</div>
                                    <div className="text-sm font-bold text-neutral-900 dark:text-white">Completed</div>
                                </div>
                            </div>
                        </div>

                        <div className="absolute -left-8 bottom-32 bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-xl border border-neutral-100 dark:border-neutral-700 animate-float-delayed" style={{ transform: "translateZ(80px)" }}>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                                    <Zap className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                                </div>
                                <div>
                                    <div className="text-xs text-neutral-500 font-medium">Team Velocity</div>
                                    <div className="text-sm font-bold text-neutral-900 dark:text-white">+24% Increase</div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            </div>
        </section>
    );
}
