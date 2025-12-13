import React from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import Typography from '../Typography';
import { chartColors, chartStyles } from '@/lib/chart-colors';

interface VelocityData {
    sprintId: string;
    sprintName: string;
    completedPoints: number;
    totalPoints: number;
}

interface VelocityChartProps {
    data: VelocityData[];
}

export default function VelocityChart({ data }: VelocityChartProps) {
    return (
        <div className="w-full h-[400px] bg-white dark:bg-neutral-800 rounded-xl p-4 shadow-sm border border-neutral-100 dark:border-neutral-700">
            <div className="mb-6">
                <Typography variant="h4" className="font-bold text-neutral-900 dark:text-white">Velocity Chart</Typography>
                <p className="text-sm text-neutral-500">Track average completion rate over the last 5 sprints.</p>
            </div>

            <ResponsiveContainer width="100%" height={300}>
                <BarChart
                    data={data}
                    margin={{
                        top: 20,
                        right: 30,
                        left: 20,
                        bottom: 5,
                    }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                    <XAxis
                        dataKey="sprintName"
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
                        label={{ value: 'Story Points', angle: -90, position: 'insideLeft', style: { fill: chartColors.neutralDark } }}
                    />
                    <Tooltip
                        cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                        contentStyle={chartStyles.tooltip}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar dataKey="completedPoints" name="Completed" fill={chartColors.success} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="totalPoints" name="Commitment" fill={chartColors.neutral} radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

