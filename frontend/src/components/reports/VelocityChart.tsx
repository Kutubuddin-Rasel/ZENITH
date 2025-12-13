import React from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface VelocityData {
    sprintName: string;
    committedPoints: number;
    completedPoints: number;
}

interface VelocityChartProps {
    data: VelocityData[];
}

export default function VelocityChart({ data }: VelocityChartProps) {
    const averageVelocity = data.reduce((acc, sprint) => acc + sprint.completedPoints, 0) / data.length;

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-6 rounded-xl">
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">Average Velocity</h3>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{averageVelocity.toFixed(1)} points per sprint</p>
            </div>

            <ResponsiveContainer width="100%" height={400}>
                <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="sprintName" />
                    <YAxis label={{ value: 'Story Points', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="committedPoints" fill="#8884d8" name="Committed Points" />
                    <Bar dataKey="completedPoints" fill="#3b82f6" name="Completed Points" />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
