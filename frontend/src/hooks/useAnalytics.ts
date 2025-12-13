import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

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
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

        fetch(`${API_URL}/projects/${projectId}/analytics/cycle-time?days=${days}`, {
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                'Content-Type': 'application/json',
            },
        })
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch cycle time');
                return res.json();
            })
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
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

        fetch(`${API_URL}/projects/${projectId}/analytics/sprints/${sprintId}/risk`, {
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                'Content-Type': 'application/json',
            },
        })
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch sprint risk');
                return res.json();
            })
            .then(setData)
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [projectId, sprintId]);

    return { data, loading, error };
}
