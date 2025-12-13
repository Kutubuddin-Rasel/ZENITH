"use client";
import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { useCycleTime, useSprintRisk } from '../../../../hooks/useAnalytics';
import { useActiveSprint } from '../../../../hooks/useSprints';
import CycleTimeChart from '../../../../components/analytics/CycleTimeChart';
import SprintRiskCard from '../../../../components/analytics/SprintRiskCard';
import Typography from '../../../../components/Typography';
import Card from '../../../../components/Card';
import Spinner from '../../../../components/Spinner';
import Button from '../../../../components/Button';
import { ChartBarIcon } from '@heroicons/react/24/outline';

export default function AnalyticsPage() {
    const params = useParams();
    const projectId = params.id as string;
    const [daysLookback, setDaysLookback] = useState(30);

    const { activeSprint, isLoading: loadingSprint } = useActiveSprint(projectId);
    const { data: cycleTimeData, loading: loadingCycle, error: errorCycle } = useCycleTime(projectId, daysLookback);
    const { data: riskData, loading: loadingRisk, error: errorRisk } = useSprintRisk(projectId, activeSprint?.id || '');

    if (loadingSprint || (loadingCycle && !cycleTimeData) || (loadingRisk && !riskData && activeSprint)) {
        return (
            <div className="flex justify-center items-center h-96">
                <Spinner className="h-12 w-12" />
            </div>
        );
    }

    return (
        <div className="space-y-8 p-8 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <Typography variant="h2" className="text-gray-900 dark:text-white flex items-center gap-3">
                        <ChartBarIcon className="h-8 w-8 text-primary-600" />
                        Project Analytics
                    </Typography>
                    <Typography variant="body" className="text-gray-500 mt-2">
                        Advanced engineering metrics and risk analysis.
                    </Typography>
                </div>

                <div className="flex gap-2">
                    <Button
                        variant={daysLookback === 14 ? 'primary' : 'secondary'}
                        onClick={() => setDaysLookback(14)}
                        size="sm"
                    >
                        14 Days
                    </Button>
                    <Button
                        variant={daysLookback === 30 ? 'primary' : 'secondary'}
                        onClick={() => setDaysLookback(30)}
                        size="sm"
                    >
                        30 Days
                    </Button>
                    <Button
                        variant={daysLookback === 90 ? 'primary' : 'secondary'}
                        onClick={() => setDaysLookback(90)}
                        size="sm"
                    >
                        90 Days
                    </Button>
                </div>
            </div>

            {/* Top Row: Cycle Time & Risk */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Cycle Time */}
                {errorCycle ? (
                    <Card className="p-6 border-red-200 bg-red-50 text-red-700">
                        Error loading cycle time: {errorCycle}
                    </Card>
                ) : cycleTimeData ? (
                    <CycleTimeChart data={cycleTimeData} days={daysLookback} />
                ) : null}

                {/* Sprint Risk */}
                {!activeSprint ? (
                    <Card className="p-6 flex flex-col items-center justify-center text-center h-[400px]">
                        <Typography variant="h4" className="text-gray-500 mb-2">No Active Sprint</Typography>
                        <Typography variant="body" className="text-gray-400">Start a sprint to resolve risk analysis.</Typography>
                    </Card>
                ) : errorRisk ? (
                    <Card className="p-6 border-red-200 bg-red-50 text-red-700">
                        Error loading sprint risk: {errorRisk}
                    </Card>
                ) : riskData ? (
                    <SprintRiskCard data={riskData} sprintName={activeSprint.name} />
                ) : null}
            </div>

            {/* Insight Section (Future) */}
            <Card className="p-6">
                <Typography variant="h3" className="mb-4">Development Velocity</Typography>
                <div className="p-8 text-center bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                    <Typography variant="body" className="text-gray-500">
                        Velocity charts and prediction models coming soon...
                    </Typography>
                </div>
            </Card>
        </div>
    );
}
