"use client";
import React from 'react';
import { useParams } from 'next/navigation';
import ProtectedProjectRoute from '@/components/ProtectedProjectRoute';
import ProjectSecurityPolicies from '@/components/ProjectSecurityPolicies';

/**
 * Project Security Policies Page
 * Path: /projects/[id]/settings/policies
 * 
 * This is for PROJECT ADMINS to configure security requirements
 * that ALL project members must meet. Different from User Security Settings.
 */
export default function PoliciesSettingsPage() {
    const params = useParams();
    const projectId = params.id as string;

    return (
        <ProtectedProjectRoute allowedRoles={["Super-Admin", "ProjectLead"]}>
            <ProjectSecurityPolicies projectId={projectId} />
        </ProtectedProjectRoute>
    );
}
