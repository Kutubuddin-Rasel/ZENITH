"use client";
import React from 'react';
import Card from '@/components/Card';
import { CardHeader, CardContent, CardTitle } from '@/components/CardComponents';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Label from '@/components/Label';
import Switch from '@/components/Switch';
import Alert, { AlertDescription } from '@/components/Alert';
import { 
  Shield, 
  Clock, 
  AlertTriangle, 
  Save,
  RefreshCw,
  Info,
  Settings
} from 'lucide-react';
import AccessControlManagement from '@/components/AccessControlManagement';

export default function AccessControlSettingsPage() {
  const [settings, setSettings] = React.useState({
    accessControlEnabled: true,
    defaultPolicy: 'deny',
    emergencyAccessEnabled: true,
    geographicFiltering: true,
    timeBasedFiltering: true,
    userSpecificRules: true,
    roleBasedRules: true,
    maxRulesPerUser: 10,
    autoCleanupEnabled: true,
    cleanupIntervalHours: 24,
    notificationEnabled: true,
    logAllAccess: true,
    requireApprovalForNewRules: false,
    allowEmergencyAccess: true,
    maxEmergencyAccessDuration: 24, // hours
  });

  const [loading, setLoading] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRuleCreated = () => {
    console.log('Rule created successfully');
  };

  const handleRuleUpdated = () => {
    console.log('Rule updated successfully');
  };

  const handleRuleDeleted = () => {
    console.log('Rule deleted successfully');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Access Control Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure IP whitelisting, geographic restrictions, and access control policies.
        </p>
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
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="accessControlEnabled">Enable Access Control</Label>
                <p className="text-sm text-muted-foreground">
                  Enable or disable the entire access control system
                </p>
              </div>
              <Switch
                id="accessControlEnabled"
                checked={settings.accessControlEnabled}
                onCheckedChange={(checked) => setSettings(prev => ({
                  ...prev,
                  accessControlEnabled: checked
                }))}
              />
            </div>
            <div>
              <Label htmlFor="defaultPolicy">Default Policy</Label>
              <select
                id="defaultPolicy"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={settings.defaultPolicy}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  defaultPolicy: e.target.value
                }))}
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
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  maxRulesPerUser: parseInt(e.target.value) || 10
                }))}
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
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="emergencyAccessEnabled">Emergency Access</Label>
                <p className="text-sm text-muted-foreground">
                  Allow emergency access for critical situations
                </p>
              </div>
              <Switch
                id="emergencyAccessEnabled"
                checked={settings.emergencyAccessEnabled}
                onCheckedChange={(checked) => setSettings(prev => ({
                  ...prev,
                  emergencyAccessEnabled: checked
                }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="geographicFiltering">Geographic Filtering</Label>
                <p className="text-sm text-muted-foreground">
                  Enable country, region, and city-based access control
                </p>
              </div>
              <Switch
                id="geographicFiltering"
                checked={settings.geographicFiltering}
                onCheckedChange={(checked) => setSettings(prev => ({
                  ...prev,
                  geographicFiltering: checked
                }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="timeBasedFiltering">Time-based Filtering</Label>
                <p className="text-sm text-muted-foreground">
                  Allow time-based access restrictions
                </p>
              </div>
              <Switch
                id="timeBasedFiltering"
                checked={settings.timeBasedFiltering}
                onCheckedChange={(checked) => setSettings(prev => ({
                  ...prev,
                  timeBasedFiltering: checked
                }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="userSpecificRules">User-specific Rules</Label>
                <p className="text-sm text-muted-foreground">
                  Allow users to create personal access rules
                </p>
              </div>
              <Switch
                id="userSpecificRules"
                checked={settings.userSpecificRules}
                onCheckedChange={(checked) => setSettings(prev => ({
                  ...prev,
                  userSpecificRules: checked
                }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="roleBasedRules">Role-based Rules</Label>
                <p className="text-sm text-muted-foreground">
                  Enable role-based access control rules
                </p>
              </div>
              <Switch
                id="roleBasedRules"
                checked={settings.roleBasedRules}
                onCheckedChange={(checked) => setSettings(prev => ({
                  ...prev,
                  roleBasedRules: checked
                }))}
              />
            </div>
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
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="logAllAccess">Log All Access Attempts</Label>
                <p className="text-sm text-muted-foreground">
                  Log all access attempts for audit purposes
                </p>
              </div>
              <Switch
                id="logAllAccess"
                checked={settings.logAllAccess}
                onCheckedChange={(checked) => setSettings(prev => ({
                  ...prev,
                  logAllAccess: checked
                }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="notificationEnabled">Enable Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Send notifications for access control events
                </p>
              </div>
              <Switch
                id="notificationEnabled"
                checked={settings.notificationEnabled}
                onCheckedChange={(checked) => setSettings(prev => ({
                  ...prev,
                  notificationEnabled: checked
                }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="requireApprovalForNewRules">Require Approval for New Rules</Label>
                <p className="text-sm text-muted-foreground">
                  Require admin approval for new access rules
                </p>
              </div>
              <Switch
                id="requireApprovalForNewRules"
                checked={settings.requireApprovalForNewRules}
                onCheckedChange={(checked) => setSettings(prev => ({
                  ...prev,
                  requireApprovalForNewRules: checked
                }))}
              />
            </div>
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
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="autoCleanupEnabled">Automatic Cleanup</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically clean up expired rules
                </p>
              </div>
              <Switch
                id="autoCleanupEnabled"
                checked={settings.autoCleanupEnabled}
                onCheckedChange={(checked) => setSettings(prev => ({
                  ...prev,
                  autoCleanupEnabled: checked
                }))}
              />
            </div>
            <div>
              <Label htmlFor="cleanupIntervalHours">Cleanup Interval (hours)</Label>
              <Input
                id="cleanupIntervalHours"
                type="number"
                min="1"
                max="168"
                value={settings.cleanupIntervalHours}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  cleanupIntervalHours: parseInt(e.target.value) || 24
                }))}
              />
              <p className="text-sm text-muted-foreground mt-1">
                How often to run automatic cleanup
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {loading ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>

        {saved && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Access control settings have been saved successfully.
            </AlertDescription>
          </Alert>
        )}

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
