import React from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface CumulativeFlowData {
    date: string;
    [key: string]: string | number;
}

interface CumulativeFlowChartProps {
    data: CumulativeFlowData[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export default function CumulativeFlowChart({ data }: CumulativeFlowChartProps) {
    const statuses = Object.keys(data[0]).filter(key => key !== 'date');

    return (
        <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                {statuses.map((status, index) => (
                    <Area
                        key={status}
                        type="monotone"
                        dataKey={status}
                        stackId="1"
                        stroke={COLORS[index % COLORS.length]}
                        fill={COLORS[index % COLORS.length]}
                    />
                ))}
            </AreaChart>
        </ResponsiveContainer>
    );
}
