"use client";
import React from 'react';
import Card from './Card';
import { CardHeader, CardContent, CardTitle } from './CardComponents';
import Switch from './Switch';
import Label from './Label';
import Spinner from './Spinner';
import Alert, { AlertDescription } from './Alert';
import { Shield, AlertTriangle, Users, CheckCircle2 } from 'lucide-react';
import {
    useProjectSecurityPolicy,
    useUpdateProjectSecurityPolicy,
    type ProjectSecurityPolicy,
} from '../hooks/useProjectSecurityPolicy';
import { useToast } from '../context/ToastContext';

interface ProjectSecurityPoliciesProps {
    projectId: string;
}

/**
 * ProjectSecurityPolicies Component
 * 
 * Allows Project Leads/Admins to configure security requirements for all project members
 * This is DIFFERENT from User Security Settings - these are PROJECT policies
 */
export default function ProjectSecurityPolicies({ projectId }: ProjectSecurityPoliciesProps) {
    const { data: policy, isLoading, error } = useProjectSecurityPolicy(projectId);
    const { mutate: updatePolicy, isPending: isSaving } = useUpdateProjectSecurityPolicy(projectId);
    const { showToast } = useToast();

    const handleToggle = (field: keyof ProjectSecurityPolicy, value: boolean) => {
        if (!policy) return;

        updatePolicy(
            { [field]: value },
            {
                onSuccess: () => {
                    showToast('Policy updated', 'success');
                },
                onError: (error) => {
                    showToast(error.message || 'Failed to update policy', 'error');
                },
            }
        );
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center p-8">
                <Spinner className="h-6 w-6" />
            </div>
        );
    }

    if (error || !policy) {
        return (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                    {error?.message || 'Failed to load security policies'}
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Shield className="h-6 w-6 text-blue-600" />
                    Project Security Policies
                </h2>
                <p className="text-neutral-600 dark:text-neutral-400 mt-1">
                    Configure security requirements for all project members
                </p>
            </div>

            {/* Auto-save indicator */}
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>Auto-save enabled</span>
            </div>

            {/* Authentication Policies */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Authentication Requirements
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Require 2FA */}
                    <div className="flex items-center justify-between">
                        <div>
                            <Label htmlFor="require2FA" className="text-base font-medium">
                                Require Two-Factor Authentication
                            </Label>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                All project members must have 2FA enabled to access this project
                            </p>
                        </div>
                        <Switch
                            id="require2FA"
                            checked={policy.require2FA}
                            onCheckedChange={(checked) => handleToggle('require2FA', checked)}
                            disabled={isSaving}
                        />
                    </div>

                    {/* Require Password Complexity */}
                    <div className="flex items-center justify-between">
                        <div>
                            <Label htmlFor="requirePasswordComplexity" className="text-base font-medium">
                                Require Strong Passwords
                            </Label>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                Members must use passwords with mixed case, numbers, and special characters
                            </p>
                        </div>
                        <Switch
                            id="requirePasswordComplexity"
                            checked={policy.requirePasswordComplexity}
                            onCheckedChange={(checked) => handleToggle('requirePasswordComplexity', checked)}
                            disabled={isSaving}
                        />
                    </div>

                    {/* Enforce Session Timeout */}
                    <div className="flex items-center justify-between">
                        <div>
                            <Label htmlFor="enforceSessionTimeout" className="text-base font-medium">
                                Enforce Session Timeout
                            </Label>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                Apply project's session timeout to all members (max {policy.maxSessionTimeoutMinutes} minutes)
                            </p>
                        </div>
                        <Switch
                            id="enforceSessionTimeout"
                            checked={policy.enforceSessionTimeout}
                            onCheckedChange={(checked) => handleToggle('enforceSessionTimeout', checked)}
                            disabled={isSaving}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Access Control Policies */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Access Control
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Require IP Allowlist */}
                    <div className="flex items-center justify-between">
                        <div>
                            <Label htmlFor="requireIPAllowlist" className="text-base font-medium">
                                Require IP Allowlist
                            </Label>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                Members can only access from whitelisted IP addresses
                            </p>
                        </div>
                        <Switch
                            id="requireIPAllowlist"
                            checked={policy.requireIPAllowlist}
                            onCheckedChange={(checked) => handleToggle('requireIPAllowlist', checked)}
                            disabled={isSaving}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Notifications */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        Notifications
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Notify on Violation */}
                    <div className="flex items-center justify-between">
                        <div>
                            <Label htmlFor="notifyOnPolicyViolation" className="text-base font-medium">
                                Notify on Policy Violations
                            </Label>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                Receive alerts when members don't meet security requirements
                            </p>
                        </div>
                        <Switch
                            id="notifyOnPolicyViolation"
                            checked={policy.notifyOnPolicyViolation}
                            onCheckedChange={(checked) => handleToggle('notifyOnPolicyViolation', checked)}
                            disabled={isSaving}
                        />
                    </div>

                    {/* Notify on Access Denied */}
                    <div className="flex items-center justify-between">
                        <div>
                            <Label htmlFor="notifyOnAccessDenied" className="text-base font-medium">
                                Notify on Access Denied
                            </Label>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                Receive alerts when members are blocked due to policy violations
                            </p>
                        </div>
                        <Switch
                            id="notifyOnAccessDenied"
                            checked={policy.notifyOnAccessDenied}
                            onCheckedChange={(checked) => handleToggle('notifyOnAccessDenied', checked)}
                            disabled={isSaving}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Info Alert */}
            <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                    <strong>Note:</strong> These policies apply to all project members.
                    Members who don't meet the requirements will be blocked from accessing the project
                    and redirected to their security settings.
                </AlertDescription>
            </Alert>
        </div>
    );
}
