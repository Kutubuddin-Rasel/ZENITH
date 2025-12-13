import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import Typography from '../Typography';
import { Sprint } from '../../hooks/useSprints';
import { chartColors, chartStyles } from '@/lib/chart-colors';

interface Snapshot {
    id: string;
    date: string;
    totalPoints: number;
    completedPoints: number;
    remainingPoints: number;
}

interface BurndownChartProps {
    sprint: Sprint;
    snapshots: Snapshot[];
    idealBurnRate: number;
    initialScope: number;
}

export default function BurndownChart({ sprint, snapshots, idealBurnRate, initialScope }: BurndownChartProps) {
    // Generate data points for every day of the sprint
    const data = React.useMemo(() => {
        if (!sprint.startDate || !sprint.endDate) return [];

        const start = new Date(sprint.startDate);
        const end = new Date(sprint.endDate);
        const days = [];
        const current = new Date(start);

        // Create a map of actual snapshots for quick lookup
        const snapshotMap = new Map(snapshots.map(s => [s.date, s]));

        let dayIndex = 0;
        while (current <= end) {
            const dateStr = current.toISOString().split('T')[0];
            const snapshot = snapshotMap.get(dateStr);

            // Calculate Ideal Remaining
            // Ideally: Start at initialScope, reach 0 at end
            const idealRemaining = Math.max(0, initialScope - (idealBurnRate * dayIndex));

            days.push({
                date: dateStr,
                displayDate: current.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                ideal: parseFloat(idealRemaining.toFixed(1)),
                remaining: snapshot ? snapshot.remainingPoints : null, // Null means future/no data yet
                totalScope: snapshot ? snapshot.totalPoints : null, // Show scope changes
            });

            current.setDate(current.getDate() + 1);
            dayIndex++;
        }
        return days;
    }, [sprint, snapshots, idealBurnRate, initialScope]);

    return (
        <div className="w-full h-[400px] bg-white dark:bg-neutral-800 rounded-xl p-4 shadow-sm border border-neutral-100 dark:border-neutral-700">
            <div className="mb-6">
                <Typography variant="h4" className="font-bold text-neutral-900 dark:text-white">Burndown Chart</Typography>
                <p className="text-sm text-neutral-500">Track work remaining vs. ideal completion rate.</p>
            </div>

            <ResponsiveContainer width="100%" height={300}>
                <LineChart
                    data={data}
                    margin={{
                        top: 5,
                        right: 30,
                        left: 20,
                        bottom: 5,
                    }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                    <XAxis
                        dataKey="displayDate"
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
                    <Tooltip contentStyle={chartStyles.tooltip} />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />

                    {/* Ideal Burn Line */}
                    <Line
                        type="monotone"
                        dataKey="ideal"
                        name="Ideal Guideline"
                        stroke={chartColors.neutral}
                        strokeDasharray="5 5"
                        strokeWidth={2}
                        dot={false}
                    />

                    {/* Actual Remaining Line */}
                    <Line
                        type="monotone"
                        dataKey="remaining"
                        name="Remaining Work"
                        stroke={chartColors.primary}
                        strokeWidth={3}
                        activeDot={{ r: 6 }}
                        connectNulls
                    />

                    {/* Scope Line (to show creep) */}
                    <Line
                        type="stepAfter"
                        dataKey="totalScope"
                        name="Total Scope"
                        stroke={chartColors.error}
                        strokeWidth={1}
                        dot={false}
                        connectNulls
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

