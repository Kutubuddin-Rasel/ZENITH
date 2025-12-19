"use client";
import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    useVelocityReport,
    useBurndownReport,
    useEpicProgressReport,
    useIssueBreakdownReport
} from '@/hooks/useReports';
import { useCycleTime, useSprintRisk } from '@/hooks/useAnalytics';
import { useActiveSprint } from '@/hooks/useSprints';
import Card from '@/components/Card';
import Spinner from '@/components/Spinner';
import Typography from '@/components/Typography';
import CycleTimeChart from '@/components/analytics/CycleTimeChart';
import SprintRiskCard from '@/components/analytics/SprintRiskCard';
import ProtectedProjectRoute from '@/components/ProtectedProjectRoute';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import {
    ChartBarIcon,
    ArrowTrendingDownIcon,
    BookOpenIcon,
    ChartPieIcon,
    ClockIcon,
    FireIcon,
    ShieldCheckIcon,
    Squares2X2Icon,
    RocketLaunchIcon,
    MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const TABS = [
    { id: 'overview', name: 'Overview', icon: Squares2X2Icon, description: 'Sprint health summary' },
    { id: 'planning', name: 'Planning', icon: ChartBarIcon, description: 'Velocity & risk analysis' },
    { id: 'delivery', name: 'Delivery', icon: RocketLaunchIcon, description: 'Burndown & cycle time' },
    { id: 'analysis', name: 'Analysis', icon: MagnifyingGlassIcon, description: 'Issue breakdown & epics' },
] as const;

type TabId = typeof TABS[number]['id'];

function InsightsContent() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const projectId = params.id as string;

    const urlTab = searchParams.get('view') as TabId | null;
    const [activeTab, setActiveTab] = useState<TabId>(urlTab && TABS.some(t => t.id === urlTab) ? urlTab : 'overview');
    const [daysLookback, setDaysLookback] = useState(30);

    useEffect(() => {
        const currentView = searchParams.get('view');
        if (currentView !== activeTab) {
            const newParams = new URLSearchParams(searchParams.toString());
            newParams.set('view', activeTab);
            router.replace(`?${newParams.toString()}`, { scroll: false });
        }
    }, [activeTab, searchParams, router]);

    const { data: velocityData, isLoading: velocityLoading } = useVelocityReport(projectId);
    const { data: burndownData, isLoading: burndownLoading } = useBurndownReport(projectId);
    const { data: epicProgressData, isLoading: epicProgressLoading } = useEpicProgressReport(projectId);
    const { data: issueBreakdownData, isLoading: issueBreakdownLoading } = useIssueBreakdownReport(projectId);

    const { activeSprint, isLoading: loadingSprint } = useActiveSprint(projectId);
    const { data: cycleTimeData, loading: loadingCycle } = useCycleTime(projectId, daysLookback);
    const { data: riskData, loading: loadingRisk } = useSprintRisk(projectId, activeSprint?.id || '');

    const healthData = useMemo(() => {
        const hasSprintData = (velocityData?.length ?? 0) > 0 || (burndownData?.length ?? 0) > 0 || activeSprint;

        if (!hasSprintData) {
            return { score: null, factors: ['No sprint data available'] };
        }

        let score = 100;
        const factors: string[] = [];

        if (burndownData && burndownData.length > 0) {
            const sprint = burndownData[0];
            if (sprint.completionPercentage < 50) {
                score -= 20;
                factors.push('Low completion rate');
            }
        }

        if (riskData) {
            if (riskData.score > 75) {
                score -= 30;
                factors.push('High risk score');
            } else if (riskData.score > 50) {
                score -= 15;
                factors.push('Moderate risk');
            }
        }

        if (velocityData && velocityData.length >= 2) {
            const recent = velocityData.slice(-2);
            if (recent[1].completedPoints < recent[0].completedPoints * 0.8) {
                score -= 15;
                factors.push('Velocity declining');
            }
        }

        if (cycleTimeData && cycleTimeData.trend === 'up') {
            score -= 10;
            factors.push('Cycle time increasing');
        }

        return { score: Math.max(0, score), factors };
    }, [velocityData, burndownData, activeSprint, riskData, cycleTimeData]);

    const velocityAverage = useMemo(() => velocityData && velocityData.length > 0
        ? velocityData.reduce((acc, sprint) => acc + sprint.completedPoints, 0) / velocityData.length
        : 0, [velocityData]);

    const isLoading = loadingSprint || velocityLoading || burndownLoading || loadingCycle || epicProgressLoading || issueBreakdownLoading || loadingRisk;

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="relative">
                    <div className="absolute inset-0 rounded-full blur-xl bg-primary-500/30 animate-pulse" />
                    <Spinner className="h-16 w-16 text-primary-600 relative z-10" />
                </div>
            </div>
        );
    }

    const containerVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5, staggerChildren: 0.1 } }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0 }
    };

    return (
        <div className="space-y-4 p-4 lg:p-6 max-w-[1600px] mx-auto min-h-screen bg-gray-50/50 dark:bg-[#0a0a0a]">
            {/* Navigation & Controls Bar - Sticky */}
            <div className="sticky top-0 z-50 -mx-4 lg:-mx-6 px-4 lg:px-6 py-3 bg-gray-50/95 dark:bg-[#0a0a0a]/95 backdrop-blur-lg border-b border-gray-200/50 dark:border-neutral-800/50">
                <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                    {/* Navigation Tabs - Left */}
                    <div className="flex overflow-x-auto pb-2 md:pb-0 scrollbar-hide w-full md:w-auto">
                        <div className="flex items-center gap-2 p-1.5 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm">
                            {TABS.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`relative flex items-center gap-2.5 px-6 py-2.5 rounded-xl font-medium text-sm transition-all duration-300 outline-none ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                                            }`}
                                    >
                                        {isActive && (
                                            <motion.div
                                                layoutId="activeTab"
                                                className="absolute inset-0 bg-gray-900 dark:bg-white rounded-xl shadow-lg"
                                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                            />
                                        )}
                                        <span className={`relative z-10 flex items-center gap-2 ${isActive ? 'text-white dark:text-black' : ''}`}>
                                            <Icon className="h-4 w-4" />
                                            {tab.name}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Date Selector - Right */}
                    <div className="flex items-center gap-2 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl p-1.5 rounded-2xl shadow-sm border border-gray-200 dark:border-neutral-800">
                        {[14, 30, 90].map((days) => (
                            <button
                                key={days}
                                onClick={() => setDaysLookback(days)}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${daysLookback === days
                                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                                    }`}
                            >
                                {days}d
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
                    className="min-h-[500px]"
                >
                    {activeTab === 'overview' && (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            {/* Health Score - Large Card */}
                            <motion.div variants={itemVariants} className="md:col-span-2">
                                <Card className="h-full p-5 border-none shadow-lg bg-gradient-to-br from-white to-gray-50 dark:from-neutral-900 dark:to-neutral-950 relative overflow-hidden group">
                                    <div className={`absolute top-0 right-0 w-32 h-32 bg-${healthData.score && healthData.score > 80 ? 'emerald' : 'amber'}-500/10 rounded-full blur-3xl group-hover:bg-${healthData.score && healthData.score > 80 ? 'emerald' : 'amber'}-500/20 transition-all duration-500`} />
                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className={`p-2 rounded-lg ${healthData.score && healthData.score > 80 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                                    <ShieldCheckIcon className="h-6 w-6" />
                                                </div>
                                                <Typography variant="h3" className="font-bold text-gray-900 dark:text-white">Sprint Health</Typography>
                                            </div>
                                            <p className="text-gray-500 max-w-xs mt-2 text-sm leading-relaxed">
                                                {healthData.factors.length > 0 ? healthData.factors.join(' • ') : 'All systems operational. Team is performing optimally.'}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-6xl font-black tracking-tighter text-gray-900 dark:text-white">
                                                {healthData.score ?? '--'}
                                            </div>
                                            <div className="text-sm font-medium text-gray-400 mt-1 uppercase tracking-wider">Score</div>
                                        </div>
                                    </div>
                                    {/* Progress Bar */}
                                    <div className="mt-4 w-full bg-gray-100 dark:bg-neutral-800 rounded-full h-2 overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${healthData.score ?? 0}%` }}
                                            transition={{ duration: 1, ease: "easeOut" }}
                                            className={`h-full rounded-full ${healthData.score && healthData.score > 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                        />
                                    </div>
                                </Card>
                            </motion.div>
                            {/* Velocity Summary - Compact */}
                            <motion.div variants={itemVariants} className="md:col-span-1">
                                <Card className="h-full p-4 border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:shadow-lg transition-all duration-300">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                            <ChartBarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-full">Last 3 Sprints</span>
                                    </div>
                                    <div className="space-y-1">
                                        <Typography className="text-sm text-gray-500">Average Velocity</Typography>
                                        <div className="text-3xl font-bold text-gray-900 dark:text-white">{velocityAverage.toFixed(0)}</div>
                                        <div className="text-xs text-green-600 font-medium flex items-center gap-1">
                                            {/* Static trend for now, can be dynamic later */}
                                            <ArrowTrendingDownIcon className="h-3 w-3 rotate-180" />
                                            <span>Consistent performance</span>
                                        </div>
                                    </div>
                                </Card>
                            </motion.div>

                            {/* Cycle Time Summary - Compact */}
                            <motion.div variants={itemVariants} className="md:col-span-1">
                                <Card className="h-full p-4 border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:shadow-lg transition-all duration-300">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                                            <ClockIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                        </div>
                                        {cycleTimeData?.p85Days && (
                                            <span className="text-xs font-semibold text-purple-600 bg-purple-50 dark:bg-purple-900/20 px-2 py-1 rounded-full">
                                                P85: {cycleTimeData.p85Days}d
                                            </span>
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <Typography className="text-sm text-gray-500">Avg Cycle Time</Typography>
                                        <div className="text-3xl font-bold text-gray-900 dark:text-white">{cycleTimeData?.averageDays ?? '--'} <span className="text-base text-gray-400 font-normal">days</span></div>
                                        <div className="text-xs text-gray-500">
                                            Time from &apos;Start&apos; to &apos;Done&apos;
                                        </div>
                                    </div>
                                </Card>
                            </motion.div>
                            {/* Sprint Burndown - Compact */}
                            <motion.div variants={itemVariants} className="md:col-span-4">
                                <Card className="h-full p-5 border-none shadow-lg bg-white dark:bg-neutral-900">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <Typography variant="h4" className="font-bold flex items-center gap-2">
                                                <RocketLaunchIcon className="h-5 w-5 text-indigo-500" />
                                                Active Sprint Burndown
                                            </Typography>
                                            <p className="text-sm text-gray-500 mt-1">Real-time tracking of sprint completion</p>
                                        </div>
                                        <div className="flex gap-4">
                                            <div className="text-right">
                                                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                                    {burndownData?.[0]?.completionPercentage.toFixed(0) ?? 0}%
                                                </div>
                                                <div className="text-xs text-gray-500">Completed</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="h-[180px] w-full">
                                        {burndownData && burndownData.length > 0 ? (
                                            <>
                                                {/* Compact Progress Bar Visualization */}
                                                <div className="space-y-3">
                                                    <div className="flex justify-between text-sm font-medium text-gray-600 dark:text-gray-400">
                                                        <span>0 Points</span>
                                                        <span>{burndownData[0].totalPoints} Points</span>
                                                    </div>
                                                    <div className="h-6 w-full bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden flex">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${burndownData[0].completionPercentage}%` }}
                                                            transition={{ duration: 1.5, ease: "circOut" }}
                                                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                                                        />
                                                    </div>
                                                    <div className="flex justify-between text-xs text-gray-500">
                                                        <span>{burndownData[0].completedPoints} completed</span>
                                                        <span>{burndownData[0].remainingPoints} remaining</span>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex items-center justify-center h-full">
                                                <div className="text-center">
                                                    <RocketLaunchIcon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                                    <p className="text-sm text-gray-400">No active sprint</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            </motion.div>
                        </div>
                    )}
                    {activeTab === 'planning' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <motion.div variants={itemVariants}>
                                <Card className="p-5 h-full border-none shadow-lg">
                                    <div className="mb-6">
                                        <Typography variant="h4" className="font-bold flex items-center gap-2">
                                            <ChartBarIcon className="h-5 w-5 text-blue-500" />
                                            Velocity History
                                        </Typography>
                                    </div>
                                    <div className="h-[350px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={velocityData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                                                <XAxis dataKey="sprintName" tick={{ fontSize: 12 }} />
                                                <YAxis tick={{ fontSize: 12 }} />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                />
                                                <Legend />
                                                <Bar dataKey="committedPoints" fill="#e5e7eb" name="Committed" radius={[4, 4, 0, 0]} />
                                                <Bar dataKey="completedPoints" fill="#3b82f6" name="Completed" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </Card>
                            </motion.div>
                            <motion.div variants={itemVariants}>
                                {riskData ? (
                                    <SprintRiskCard data={riskData} sprintName={activeSprint?.name || "Current Sprint"} />
                                ) : (
                                    <Card className="p-6 h-full flex flex-col items-center justify-center text-center">
                                        <FireIcon className="h-12 w-12 text-gray-300 mb-4" />
                                        <Typography className="text-gray-500">No active sprint for risk analysis</Typography>
                                    </Card>
                                )}
                            </motion.div>
                        </div>
                    )}
                    {activeTab === 'delivery' && (
                        <div className="grid grid-cols-1 gap-4">
                            <motion.div variants={itemVariants}>
                                <Card className="p-5 border-none shadow-lg">
                                    <div className="mb-6 flex justify-between items-center">
                                        <Typography variant="h4" className="font-bold flex items-center gap-2">
                                            <ClockIcon className="h-5 w-5 text-purple-500" />
                                            Cycle Time Distribution
                                        </Typography>
                                        <div className="flex gap-4">
                                            <div className="text-center">
                                                <div className="text-sm text-gray-500">P50</div>
                                                <div className="font-bold text-purple-600">{cycleTimeData?.p50Days ?? '--'}d</div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-sm text-gray-500">P95</div>
                                                <div className="font-bold text-purple-600">{cycleTimeData?.p95Days ?? '--'}d</div>
                                            </div>
                                        </div>
                                    </div>
                                    {cycleTimeData && <CycleTimeChart data={cycleTimeData} days={daysLookback} />}
                                </Card>
                            </motion.div>
                        </div>
                    )}
                    {activeTab === 'analysis' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <motion.div variants={itemVariants}>
                                <Card className="p-5 h-full border-none shadow-lg">
                                    <div className="mb-6">
                                        <Typography variant="h4" className="font-bold flex items-center gap-2">
                                            <ChartPieIcon className="h-5 w-5 text-pink-500" />
                                            Issue Breakdown
                                        </Typography>
                                    </div>
                                    {issueBreakdownData?.typeBreakdown && (
                                        <div className="h-[300px]">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={Object.entries(issueBreakdownData.typeBreakdown).map(([name, value]) => ({ name, value }))}
                                                        cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value"
                                                    >
                                                        {Object.entries(issueBreakdownData.typeBreakdown).map((_, index) => (
                                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip />
                                                    <Legend />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </Card>
                            </motion.div>
                            <motion.div variants={itemVariants}>
                                <Card className="p-5 h-full border-none shadow-lg">
                                    <div className="mb-6">
                                        <Typography variant="h4" className="font-bold flex items-center gap-2">
                                            <BookOpenIcon className="h-5 w-5 text-indigo-500" />
                                            Epic Progress
                                        </Typography>
                                    </div>
                                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        {epicProgressData?.map((epic) => (
                                            <div key={epic.epicId} className="p-4 bg-gray-50 dark:bg-neutral-800/50 rounded-xl hover:bg-white dark:hover:bg-neutral-800 transition-colors shadow-sm">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="font-semibold text-sm truncate max-w-[200px]">{epic.epicTitle}</span>
                                                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-full">
                                                        {epic.completionPercentage.toFixed(0)}%
                                                    </span>
                                                </div>
                                                <div className="w-full bg-gray-200 dark:bg-neutral-700 rounded-full h-2">
                                                    <motion.div
                                                        initial={{ width: 0 }}
                                                        whileInView={{ width: `${epic.completionPercentage}%` }}
                                                        viewport={{ once: true }}
                                                        transition={{ duration: 0.8 }}
                                                        className="bg-indigo-500 h-2 rounded-full"
                                                    />
                                                </div>
                                                <div className="flex justify-between mt-2 text-xs text-gray-500">
                                                    <span>{epic.completedStories}/{epic.totalStories} Stories</span>
                                                    <span>{epic.completedStoryPoints} Pts Done</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            </motion.div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

export default function InsightsPage() {
    return (
        <ProtectedProjectRoute allowedRoles={["Super-Admin", "ProjectLead", "Developer"]}>
            <Suspense fallback={
                <div className="flex justify-center items-center h-screen bg-gray-50 dark:bg-[#0a0a0a]">
                    <Spinner className="h-10 w-10 text-primary-600" />
                </div>
            }>
                <InsightsContent />
            </Suspense>
        </ProtectedProjectRoute>
    );
}
