import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/fetcher';

export interface CycleTimeData {
    averageDays: number;
    totalIssues: number;
    trend: 'up' | 'down' | 'flat';
    data: {
        issueId: string;
        issueTitle: string;
        cycleTimeHours: number;
        completedAt: string;
    }[];
}

export interface RiskFactor {
    name: string;
    score: number;
    description: string;
}

export interface SprintRiskData {
    score: number;
    level: 'Low' | 'Medium' | 'High' | 'Critical';
    factors: RiskFactor[];
}

export function useCycleTime(projectId: string, days = 30) {
    const [data, setData] = useState<CycleTimeData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!projectId) return;
        setLoading(true);

        apiFetch<CycleTimeData>(`/projects/${projectId}/analytics/cycle-time?days=${days}`)
            .then(setData)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [projectId, days]);

    return { data, loading, error };
}

export function useSprintRisk(projectId: string, sprintId: string) {
    const [data, setData] = useState<SprintRiskData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!projectId || !sprintId) return;
        setLoading(true);

        apiFetch<SprintRiskData>(`/projects/${projectId}/analytics/sprints/${sprintId}/risk`)
            .then(setData)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [projectId, sprintId]);

    return { data, loading, error };
}
