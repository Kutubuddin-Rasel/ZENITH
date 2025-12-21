"use client";
import React from 'react';
import { useParams } from 'next/navigation';
import Card from '@/components/Card';
import { CardHeader, CardContent, CardTitle } from '@/components/CardComponents';
import Input from '@/components/Input';
import Label from '@/components/Label';
import Switch from '@/components/Switch';
import Spinner from '@/components/Spinner';
import Alert, { AlertDescription } from '@/components/Alert';
import { useToast } from '@/context/ToastContext';
import {
  Shield,
  Clock,
  AlertTriangle,
  RefreshCw,
  Settings,
  CheckCircle2
} from 'lucide-react';
import AccessControlManagement from '@/components/AccessControlManagement';
import {
  useProjectAccessSettings,
  useUpdateProjectAccessSettings,
  type ProjectAccessSettings
} from '@/hooks/useProjectAccessSettings';

/**
 * Access Control Settings Page - Real Backend Integration
 * Each toggle triggers an immediate save via API with optimistic updates
 */

export default function AccessControlSettingsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { showToast } = useToast();

  // Fetch settings from real backend
  const { data: settings, isLoading, isError } = useProjectAccessSettings(projectId);
  const { mutate: updateSettings, isPending: isSaving } = useUpdateProjectAccessSettings(projectId);

  // Track which field is currently being saved for UI feedback
  const [savingField, setSavingField] = React.useState<string | null>(null);

  // Instant save function - saves to backend immediately with optimistic update
  const instantSave = <K extends keyof ProjectAccessSettings>(
    field: K,
    value: ProjectAccessSettings[K]
  ) => {
    setSavingField(field);

    updateSettings(
      { [field]: value },
      {
        onSuccess: () => {
          showToast('Setting saved', 'success');
          setSavingField(null);
        },
        onError: (error) => {
          showToast(error instanceof Error ? error.message : 'Failed to save setting', 'error');
          setSavingField(null);
        },
      }
    );
  };

  const handleRuleCreated = () => {
    showToast('Access rule created', 'success');
  };

  const handleRuleUpdated = () => {
    showToast('Access rule updated', 'success');
  };

  const handleRuleDeleted = () => {
    showToast('Access rule deleted', 'success');
  };

  // Helper component for toggle with instant save indicator
  const InstantSaveSwitch = ({
    id,
    checked,
    onChange,
    label,
    description
  }: {
    id: keyof ProjectAccessSettings;
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    description: string;
  }) => (
    <div className="flex items-center justify-between">
      <div>
        <Label htmlFor={id} className="flex items-center gap-2">
          {label}
          {savingField === id && (
            <RefreshCw className="h-3 w-3 animate-spin text-primary-500" />
          )}
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        {savingField === id && (
          <span className="text-xs text-primary-500">Saving...</span>
        )}
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onChange}
          disabled={savingField !== null || isSaving}
        />
      </div>
    </div>
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Spinner className="h-10 w-10" />
      </div>
    );
  }

  // Error state
  if (isError || !settings) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load access control settings. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Access Control Settings</h1>
          <p className="text-muted-foreground mt-2">
            Configure IP whitelisting, geographic restrictions, and access control policies.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          <span>Auto-save enabled</span>
        </div>
      </div>

      <div className="grid gap-6">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              General Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InstantSaveSwitch
              id="accessControlEnabled"
              checked={settings.accessControlEnabled}
              onChange={(checked) => instantSave('accessControlEnabled', checked)}
              label="Enable Access Control"
              description="Enable or disable the entire access control system"
            />
            <div>
              <Label htmlFor="defaultPolicy">Default Policy</Label>
              <select
                id="defaultPolicy"
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-900"
                value={settings.defaultPolicy}
                onChange={(e) => instantSave('defaultPolicy', e.target.value)}
                disabled={savingField !== null || isSaving}
              >
                <option value="deny">Deny by default</option>
                <option value="allow">Allow by default</option>
              </select>
              <p className="text-sm text-muted-foreground mt-1">
                Policy applied when no rules match
              </p>
            </div>
            <div>
              <Label htmlFor="maxRulesPerUser">Maximum Rules per User</Label>
              <Input
                id="maxRulesPerUser"
                type="number"
                min="1"
                max="100"
                value={settings.maxRulesPerUser}
                onChange={(e) => instantSave('maxRulesPerUser', parseInt(e.target.value) || 10)}
                disabled={savingField !== null || isSaving}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Maximum number of access rules a user can create
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Security Features */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security Features
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InstantSaveSwitch
              id="emergencyAccessEnabled"
              checked={settings.emergencyAccessEnabled}
              onChange={(checked) => instantSave('emergencyAccessEnabled', checked)}
              label="Emergency Access"
              description="Allow emergency access for critical situations"
            />
            <InstantSaveSwitch
              id="geographicFiltering"
              checked={settings.geographicFiltering}
              onChange={(checked) => instantSave('geographicFiltering', checked)}
              label="Geographic Filtering"
              description="Enable country, region, and city-based access control"
            />
            <InstantSaveSwitch
              id="timeBasedFiltering"
              checked={settings.timeBasedFiltering}
              onChange={(checked) => instantSave('timeBasedFiltering', checked)}
              label="Time-based Filtering"
              description="Allow time-based access restrictions"
            />
            <InstantSaveSwitch
              id="userSpecificRules"
              checked={settings.userSpecificRules}
              onChange={(checked) => instantSave('userSpecificRules', checked)}
              label="User-specific Rules"
              description="Allow users to create personal access rules"
            />
            <InstantSaveSwitch
              id="roleBasedRules"
              checked={settings.roleBasedRules}
              onChange={(checked) => instantSave('roleBasedRules', checked)}
              label="Role-based Rules"
              description="Enable role-based access control rules"
            />
          </CardContent>
        </Card>

        {/* Logging and Monitoring */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Logging and Monitoring
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InstantSaveSwitch
              id="logAllAccess"
              checked={settings.logAllAccess}
              onChange={(checked) => instantSave('logAllAccess', checked)}
              label="Log All Access Attempts"
              description="Log all access attempts for audit purposes"
            />
            <InstantSaveSwitch
              id="notificationEnabled"
              checked={settings.notificationEnabled}
              onChange={(checked) => instantSave('notificationEnabled', checked)}
              label="Enable Notifications"
              description="Send notifications for access control events"
            />
            <InstantSaveSwitch
              id="requireApprovalForNewRules"
              checked={settings.requireApprovalForNewRules}
              onChange={(checked) => instantSave('requireApprovalForNewRules', checked)}
              label="Require Approval for New Rules"
              description="Require admin approval for new access rules"
            />
          </CardContent>
        </Card>

        {/* Maintenance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Maintenance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InstantSaveSwitch
              id="autoCleanupEnabled"
              checked={settings.autoCleanupEnabled}
              onChange={(checked) => instantSave('autoCleanupEnabled', checked)}
              label="Automatic Cleanup"
              description="Automatically clean up expired rules"
            />
            <div>
              <Label htmlFor="cleanupIntervalHours">Cleanup Interval (hours)</Label>
              <Input
                id="cleanupIntervalHours"
                type="number"
                min="1"
                max="168"
                value={settings.cleanupIntervalHours}
                onChange={(e) => instantSave('cleanupIntervalHours', parseInt(e.target.value) || 24)}
                disabled={savingField !== null || isSaving}
              />
              <p className="text-sm text-muted-foreground mt-1">
                How often to run automatic cleanup
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Security Information */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Security Notice:</strong> Access control is critical for security.
            Consider the following best practices:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Use deny-by-default policy for maximum security</li>
              <li>Enable geographic filtering to restrict access by location</li>
              <li>Set up time-based rules for business hours access</li>
              <li>Regularly review and audit access rules</li>
              <li>Enable logging for security monitoring</li>
            </ul>
          </AlertDescription>
        </Alert>
      </div>

      {/* Access Rules Management */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Access Control Rules</h2>
        <AccessControlManagement
          onRuleCreated={handleRuleCreated}
          onRuleUpdated={handleRuleUpdated}
          onRuleDeleted={handleRuleDeleted}
        />
      </div>
    </div>
  );
}
