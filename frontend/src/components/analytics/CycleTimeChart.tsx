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
        <div className="w-full bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <Typography variant="h4" className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <ClockIcon className="h-5 w-5 text-primary-500" />
                        Cycle Time
                    </Typography>
                    <p className="text-sm text-gray-500 mt-1">Average time to complete (last {days} days)</p>
                </div>
                <div className="text-right">
                    <Typography variant="h3" className="text-gray-900 dark:text-white font-bold">
                        {data.averageDays} <span className="text-base font-normal text-gray-500">days</span>
                    </Typography>
                    <div className="flex items-center justify-end gap-1 text-sm mt-1">
                        {data.trend === 'down' ? (
                            <span className="text-emerald-500 flex items-center">
                                <ArrowTrendingDownIcon className="h-4 w-4 mr-1" />
                                Improving
                            </span>
                        ) : data.trend === 'up' ? (
                            <span className="text-red-500 flex items-center">
                                <ArrowTrendingUpIcon className="h-4 w-4 mr-1" />
                                Slowing
                            </span>
                        ) : (
                            <span className="text-gray-500 flex items-center">
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
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                            <XAxis
                                dataKey="name"
                                stroke="#9ca3af"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="#9ca3af"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                label={{ value: 'Days', angle: -90, position: 'insideLeft', style: { fill: '#9ca3af' } }}
                            />
                            <RechartsTooltip
                                contentStyle={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                    borderRadius: '8px',
                                    border: 'none',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                }}
                                formatter={(value: number) => [`${value} days`, 'Cycle Time']}
                                labelStyle={{ color: '#374151', fontWeight: 600 }}
                            />
                            <ReferenceLine y={data.averageDays} stroke="#f59e0b" strokeDasharray="3 3" label="Avg" />
                            <Line
                                type="monotone"
                                dataKey="days"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                dot={{ fill: '#3b82f6', r: 3 }}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        No completed issues in this period
                    </div>
                )}
            </div>
        </div>
    );
}
