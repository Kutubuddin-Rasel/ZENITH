import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts';
import Typography from '../Typography';
import { CycleTimeData } from '../../hooks/useAnalytics';
import { ClockIcon, ArrowTrendingDownIcon, ArrowTrendingUpIcon, MinusIcon } from '@heroicons/react/24/outline';
import { chartColors, chartStyles } from '@/lib/chart-colors';

interface CycleTimeChartProps {
    data: CycleTimeData;
    days: number;
}

export default function CycleTimeChart({ data, days }: CycleTimeChartProps) {
    const chartData = data.data.map(d => ({
        name: new Date(d.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        hours: Math.round(d.cycleTimeHours),
        days: parseFloat((d.cycleTimeHours / 24).toFixed(1)),
        title: d.issueTitle
    }));

    return (
        <div className="w-full bg-white dark:bg-neutral-800 rounded-xl p-6 shadow-sm border border-neutral-100 dark:border-neutral-700">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <Typography variant="h4" className="font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                        <ClockIcon className="h-5 w-5 text-primary-500" />
                        Cycle Time
                    </Typography>
                    <p className="text-sm text-neutral-500 mt-1">Average time to complete (last {days} days)</p>
                </div>
                <div className="text-right">
                    <Typography variant="h3" className="text-neutral-900 dark:text-white font-bold">
                        {data.averageDays} <span className="text-base font-normal text-neutral-500">days</span>
                    </Typography>
                    <div className="flex items-center justify-end gap-1 text-sm mt-1">
                        {data.trend === 'down' ? (
                            <span className="text-success-500 flex items-center">
                                <ArrowTrendingDownIcon className="h-4 w-4 mr-1" />
                                Improving
                            </span>
                        ) : data.trend === 'up' ? (
                            <span className="text-error-500 flex items-center">
                                <ArrowTrendingUpIcon className="h-4 w-4 mr-1" />
                                Slowing
                            </span>
                        ) : (
                            <span className="text-neutral-500 flex items-center">
                                <MinusIcon className="h-4 w-4 mr-1" />
                                Stable
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="h-[300px] w-full">
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                            <XAxis
                                dataKey="name"
                                stroke={chartColors.neutral}
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke={chartColors.neutral}
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                label={{ value: 'Days', angle: -90, position: 'insideLeft', style: { fill: chartColors.neutral } }}
                            />
                            <RechartsTooltip
                                contentStyle={chartStyles.tooltip}
                                formatter={(value: number) => [`${value} days`, 'Cycle Time']}
                                labelStyle={{ color: chartColors.neutralDark, fontWeight: 600 }}
                            />
                            <ReferenceLine y={data.averageDays} stroke={chartColors.warning} strokeDasharray="3 3" label="Avg" />
                            <Line
                                type="monotone"
                                dataKey="days"
                                stroke={chartColors.primary}
                                strokeWidth={2}
                                dot={{ fill: chartColors.primary, r: 3 }}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-neutral-400">
                        No completed issues in this period
                    </div>
                )}
            </div>
        </div>
    );
}

