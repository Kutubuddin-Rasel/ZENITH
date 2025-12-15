'use client';

import { Sparkles, Smartphone, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AISmartSetup() {
    return (
        <section className="py-24 px-6 bg-gradient-to-b from-white to-neutral-50 dark:from-neutral-950 dark:to-neutral-900 border-t border-neutral-100 dark:border-neutral-800">
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-16">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full mb-4 border border-purple-200 dark:border-purple-800"
                    >
                        <Sparkles className="w-4 h-4" />
                        <span className="text-sm font-medium">AI-Powered Setup</span>
                    </motion.div>
                    <motion.h2
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-4xl md:text-5xl font-bold mb-4 tracking-tight text-neutral-900 dark:text-white"
                    >
                        Create projects in seconds with AI
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto"
                    >
                        Describe your project in plain English. Our AI creates the perfect workspace, templates, and workflows instantly.
                    </motion.p>
                </div>

                {/* Chat Interface Mockup */}
                <div className="relative max-w-3xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-2xl dark:shadow-purple-900/10 p-8 relative z-10"
                    >
                        {/* Messages */}
                        <div className="space-y-6 mb-8">
                            {/* AI Message */}
                            <motion.div
                                className="flex items-start gap-3"
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: 0.3 }}
                            >
                                <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center flex-shrink-0">
                                    <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                </div>
                                <div className="flex-1">
                                    <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-tl-sm px-5 py-3 inline-block max-w-md">
                                        <p className="text-neutral-800 dark:text-neutral-200">Hi! 👋 I&apos;m Zenith AI. Describe your project.</p>
                                    </div>
                                </div>
                            </motion.div>

                            {/* User Message */}
                            <motion.div
                                className="flex items-start gap-3 justify-end"
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: 0.6 }}
                            >
                                <div className="flex-1 flex justify-end">
                                    <div className="bg-blue-600 rounded-2xl rounded-tr-sm px-5 py-3 inline-block max-w-md">
                                        <p className="text-white">I need a roadmap for a Fintech App with 5 devs.</p>
                                    </div>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 font-medium ring-2 ring-white dark:ring-neutral-900">
                                    You
                                </div>
                            </motion.div>

                            {/* Thinking State */}
                            <motion.div
                                className="flex items-start gap-3"
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: 0.9 }}
                            >
                                <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center flex-shrink-0">
                                    <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                </div>
                                <div className="bg-neutral-100 dark:bg-neutral-800 rounded-2xl rounded-tl-sm px-5 py-3 inline-block">
                                    <div className="flex items-center gap-2">
                                        <div className="flex gap-1">
                                            <motion.div
                                                className="w-1.5 h-1.5 bg-purple-500 rounded-full"
                                                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                                                transition={{ duration: 0.8, repeat: Infinity }}
                                            />
                                            <motion.div
                                                className="w-1.5 h-1.5 bg-purple-500 rounded-full"
                                                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                                                transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }}
                                            />
                                            <motion.div
                                                className="w-1.5 h-1.5 bg-purple-500 rounded-full"
                                                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                                                transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }}
                                            />
                                        </div>
                                        <span className="text-sm text-neutral-500 font-medium">Analyzing requirements...</span>
                                    </div>
                                </div>
                            </motion.div>
                        </div>

                        {/* Result Card */}
                        <motion.div
                            className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 p-6 shadow-lg"
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            whileInView={{ opacity: 1, scale: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: 1.5 }}
                        >
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                                    <Smartphone className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <h3 className="font-semibold text-neutral-900 dark:text-white">Mobile Development Template</h3>
                                        <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full font-medium flex items-center gap-1 border border-green-200 dark:border-green-800">
                                            <CheckCircle className="w-3 h-3" />
                                            95% Match
                                        </span>
                                    </div>
                                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                                        Pre-configured with sprint planning, API integration workflows, and mobile-specific task templates (iOS/Android).
                                    </p>
                                    <div className="flex items-center gap-3">
                                        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm text-sm font-medium">
                                            Use Template
                                        </button>
                                        <button className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all text-sm font-medium">
                                            Customize
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>

                    {/* Decorative Elements */}
                    <div className="absolute -top-6 -right-6 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl -z-10 animate-pulse-slow"></div>
                    <div className="absolute -bottom-6 -left-6 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl -z-10 animate-pulse-slow"></div>
                </div>
            </div>
        </section>
    );
}
