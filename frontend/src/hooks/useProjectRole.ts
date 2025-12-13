import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/fetcher';

export enum ProjectRole {
    PROJECT_LEAD = 'ProjectLead',
    MEMBER = 'Member',
    VIEWER = 'Viewer',
    GUEST = 'Guest',
}

export function useProjectRole(projectId: string) {
    const [role, setRole] = useState<ProjectRole | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!projectId) {
            setLoading(false);
            return;
        }

        apiFetch<{ roleName: ProjectRole }>(`/projects/${projectId}/membership/me`)
            .then((data) => {
                setRole(data.roleName);
            })
            .catch((err) => {
                console.error('Failed to fetch project role', err);
                setRole(null);
            })
            .finally(() => setLoading(false));
    }, [projectId]);

    const isLead = role === ProjectRole.PROJECT_LEAD;
    const canEdit = role === ProjectRole.PROJECT_LEAD || role === ProjectRole.MEMBER;
    const canDelete = role === ProjectRole.PROJECT_LEAD;

    return { role, loading, isLead, canEdit, canDelete };
}
