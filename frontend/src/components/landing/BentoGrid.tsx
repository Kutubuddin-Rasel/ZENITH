'use client';

import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Zap, Activity, Users, Puzzle, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

// Mock data for burndown chart
const burndownData = [
    { value: 100 },
    { value: 92 },
    { value: 85 },
    { value: 78 },
    { value: 68 },
    { value: 58 },
    { value: 48 },
    { value: 35 },
    { value: 22 },
    { value: 12 },
    { value: 5 },
    { value: 0 },
];

export default function BentoGrid() {
    return (
        <section className="py-24 px-6 bg-white dark:bg-neutral-950">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <motion.h2
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-4xl md:text-5xl font-bold mb-4 tracking-tight text-neutral-900 dark:text-white"
                    >
                        Everything you need to ship faster
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto"
                    >
                        Powerful features designed for modern engineering teams. Real-time sync, analytics, and automation.
                    </motion.p>
                </div>

                {/* Bento Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Analytics Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8 hover:shadow-xl hover:shadow-neutral-200/50 dark:hover:shadow-none transition-all duration-300 hover:-translate-y-1"
                    >
                        <div className="mb-6">
                            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center mb-4 text-green-600 dark:text-green-400">
                                <Activity className="w-6 h-6" />
                            </div>
                            <h3 className="font-semibold text-neutral-900 dark:text-white mb-2 text-xl">Real-time Analytics</h3>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                Track sprint velocity, burndown, and team performance with live dashboards.
                            </p>
                        </div>

                        {/* Burndown Chart */}
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 rounded-xl p-4 border border-green-100 dark:border-green-900/30">
                            <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-2 font-medium">Sprint Burndown</div>
                            <div className="h-[120px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={burndownData}>
                                        <Line
                                            type="monotone"
                                            dataKey="value"
                                            stroke="#22C55E"
                                            strokeWidth={3}
                                            dot={false}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex items-center justify-between text-xs text-neutral-500 mt-2">
                                <span>Day 1</span>
                                <span className="text-green-600 dark:text-green-400 font-medium">On Track</span>
                                <span>Day 14</span>
                            </div>
                        </div>
                    </motion.div>

                    {/* Team Collaboration Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8 hover:shadow-xl hover:shadow-neutral-200/50 dark:hover:shadow-none transition-all duration-300 hover:-translate-y-1"
                    >
                        <div className="mb-6">
                            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-4 text-blue-600 dark:text-blue-400">
                                <Users className="w-6 h-6" />
                            </div>
                            <h3 className="font-semibold text-neutral-900 dark:text-white mb-2 text-xl">Team Collaboration</h3>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                Keep everyone aligned with real-time updates and @mentions.
                            </p>
                        </div>

                        {/* Team Members */}
                        <div className="space-y-3">
                            <TeamMember name="Sarah Kim" role="Engineering Lead" status="online" avatar="SK" />
                            <TeamMember name="Alex Morgan" role="Backend Dev" status="online" avatar="AM" />
                            <TeamMember name="Jordan Lee" role="Frontend Dev" status="away" avatar="JL" />
                            <TeamMember name="Riley Chen" role="Designer" status="offline" avatar="RC" />
                        </div>
                    </motion.div>

                    {/* Speed Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="bg-gradient-to-br from-blue-600 to-purple-600 border border-transparent rounded-2xl p-8 hover:shadow-xl hover:shadow-blue-500/20 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden group"
                    >
                        {/* Radial Gradient Background */}
                        <div
                            className="absolute inset-0 opacity-30 group-hover:opacity-40 transition-opacity duration-500"
                            style={{
                                background: 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.3) 0%, transparent 70%)',
                            }}
                        ></div>

                        <div className="relative z-10">
                            <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-6">
                                <Zap className="w-8 h-8 text-white" fill="white" />
                            </div>
                            <h3 className="font-semibold text-white mb-2 text-xl">Lightning Fast</h3>
                            <p className="text-sm text-white/90 mb-6">
                                Built for speed. Updates happen in real-time, no refresh needed.
                            </p>

                            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-white/80">Avg Response Time</span>
                                    <span className="text-sm font-semibold text-white">12ms</span>
                                </div>
                                <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                                    <div className="w-[95%] h-full bg-white rounded-full animate-pulse"></div>
                                </div>
                            </div>

                            <div className="mt-4 flex items-center gap-4 text-xs text-white/90">
                                <div>
                                    <div className="font-semibold text-white">99.9%</div>
                                    <div>Uptime</div>
                                </div>
                                <div className="w-px h-8 bg-white/20"></div>
                                <div>
                                    <div className="font-semibold text-white">&lt;50ms</div>
                                    <div>API Latency</div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Additional Feature Cards Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    {/* Integrations Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 }}
                        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8 hover:shadow-xl hover:shadow-neutral-200/50 dark:hover:shadow-none transition-all duration-300 hover:-translate-y-1"
                    >
                        <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center mb-4 text-purple-600 dark:text-purple-400">
                            <Puzzle className="w-6 h-6" />
                        </div>
                        <h3 className="font-semibold text-neutral-900 dark:text-white mb-2 text-xl">Seamless Integrations</h3>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                            Connect with GitHub, Slack, Figma, and 50+ other tools your team already uses.
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                            {['GitHub', 'Slack', 'Figma', 'Linear'].map((tool, i) => (
                                <div key={i} className="px-3 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs rounded-full font-medium border border-neutral-200 dark:border-neutral-700">
                                    {tool}
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Automation Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.4 }}
                        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8 hover:shadow-xl hover:shadow-neutral-200/50 dark:hover:shadow-none transition-all duration-300 hover:-translate-y-1"
                    >
                        <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center mb-4 text-orange-600 dark:text-orange-400">
                            <Settings className="w-6 h-6" />
                        </div>
                        <h3 className="font-semibold text-neutral-900 dark:text-white mb-2 text-xl">Smart Automation</h3>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                            Automate repetitive tasks with custom workflows. Save hours every week.
                        </p>
                        <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/10 dark:to-red-900/10 rounded-xl p-4 border border-orange-100 dark:border-orange-900/30">
                            <div className="flex items-center gap-2 text-sm">
                                <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                                <span className="text-neutral-700 dark:text-neutral-300">3 workflows active</span>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

interface TeamMemberProps {
    name: string;
    role: string;
    status: 'online' | 'away' | 'offline';
    avatar: string;
}

function TeamMember({ name, role, status, avatar }: TeamMemberProps) {
    const statusColors = {
        online: 'bg-green-500',
        away: 'bg-yellow-500',
        offline: 'bg-neutral-300',
    };

    return (
        <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer group">
            <div className="relative">
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-medium text-sm border-2 border-white dark:border-neutral-900 shadow-sm relative z-10">
                    {avatar}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 ${statusColors[status]} rounded-full border-2 border-white dark:border-neutral-900 z-20`}></div>
            </div>
            <div className="flex-1">
                <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{name}</div>
                <div className="text-xs text-neutral-500">{role}</div>
            </div>
        </div>
    );
}
