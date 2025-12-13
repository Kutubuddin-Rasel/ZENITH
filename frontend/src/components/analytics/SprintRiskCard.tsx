import React from 'react';
import Typography from '../Typography';
import { SprintRiskData } from '../../hooks/useAnalytics';
import { ExclamationTriangleIcon, CheckCircleIcon, FireIcon } from '@heroicons/react/24/outline';

interface SprintRiskCardProps {
    data: SprintRiskData;
    sprintName: string;
}

export default function SprintRiskCard({ data, sprintName }: SprintRiskCardProps) {
    const getRiskColor = (score: number) => {
        if (score < 40) return 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20';
        if (score < 75) return 'text-amber-500 bg-amber-50 dark:bg-amber-900/20';
        return 'text-red-500 bg-red-50 dark:bg-red-900/20';
    };

    const getProgressColor = (score: number) => {
        if (score < 40) return 'bg-emerald-500';
        if (score < 75) return 'bg-amber-500';
        return 'bg-red-500';
    };

    return (
        <div className="w-full bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <Typography variant="h4" className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <FireIcon className="h-5 w-5 text-orange-500" />
                        Sprint Risk
                        <span className="text-xs font-normal text-gray-500 ml-2 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700">
                            {sprintName}
                        </span>
                    </Typography>
                    <p className="text-sm text-gray-500 mt-1">AI-predicted risk assessment</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1 ${getRiskColor(data.score)}`}>
                    {data.score > 75 ? <ExclamationTriangleIcon className="h-4 w-4" /> : <CheckCircleIcon className="h-4 w-4" />}
                    {data.level} ({data.score})
                </div>
            </div>

            <div className="space-y-6">
                {data.factors.map((factor) => (
                    <div key={factor.name}>
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{factor.name}</span>
                            <span className="text-xs text-gray-500">{factor.description}</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                                className={`h-2 rounded-full transition-all duration-500 ${getProgressColor(factor.score)}`}
                                style={{ width: `${Math.min(100, factor.score)}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
                <Typography variant="caption" className="text-gray-400">
                    *Scores based on scope creep, velocity variance, and time pressure.
                </Typography>
            </div>
        </div>
    );
}
