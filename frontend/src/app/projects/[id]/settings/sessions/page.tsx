"use client";
import React from 'react';
import Card from '../../../../../components/Card';
import { CardHeader, CardContent, CardTitle } from '../../../../../components/CardComponents';
import Button from '../../../../../components/Button';
import Input from '../../../../../components/Input';
import Label from '../../../../../components/Label';
import Switch from '../../../../../components/Switch';
import Alert, { AlertDescription } from '../../../../../components/Alert';
import { 
  Shield, 
  Users, 
  AlertTriangle, 
  Save,
  RefreshCw,
  Info
} from 'lucide-react';
import SessionManagement from '../../../../../components/SessionManagement';

export default function SessionSettingsPage() {
  const [settings, setSettings] = React.useState({
    maxConcurrentSessions: 5,
    sessionTimeoutMinutes: 30,
    rememberMeDays: 30,
    enableSessionLocking: true,
    enableSuspiciousActivityDetection: true,
    enableSessionCleanup: true,
    cleanupIntervalHours: 24,
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

  const handleSessionTerminated = () => {
    // Refresh the session management component
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Session Management</h1>
        <p className="text-muted-foreground mt-2">
          Configure session security, timeout, and concurrent session limits.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Session Limits */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Session Limits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="maxConcurrentSessions">Maximum Concurrent Sessions</Label>
                <Input
                  id="maxConcurrentSessions"
                  type="number"
                  min="1"
                  max="20"
                  value={settings.maxConcurrentSessions}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    maxConcurrentSessions: parseInt(e.target.value) || 1
                  }))}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Maximum number of simultaneous sessions per user
                </p>
              </div>
              <div>
                <Label htmlFor="sessionTimeoutMinutes">Session Timeout (minutes)</Label>
                <Input
                  id="sessionTimeoutMinutes"
                  type="number"
                  min="5"
                  max="1440"
                  value={settings.sessionTimeoutMinutes}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    sessionTimeoutMinutes: parseInt(e.target.value) || 30
                  }))}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Inactive session timeout duration
                </p>
              </div>
            </div>
            <div>
              <Label htmlFor="rememberMeDays">Remember Me Duration (days)</Label>
              <Input
                id="rememberMeDays"
                type="number"
                min="1"
                max="365"
                value={settings.rememberMeDays}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  rememberMeDays: parseInt(e.target.value) || 30
                }))}
              />
              <p className="text-sm text-muted-foreground mt-1">
                How long &quot;Remember Me&quot; sessions last
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
                <Label htmlFor="enableSessionLocking">Enable Session Locking</Label>
                <p className="text-sm text-muted-foreground">
                  Lock sessions when suspicious activity is detected
                </p>
              </div>
              <Switch
                id="enableSessionLocking"
                checked={settings.enableSessionLocking}
                onCheckedChange={(checked) => setSettings(prev => ({
                  ...prev,
                  enableSessionLocking: checked
                }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="enableSuspiciousActivityDetection">Suspicious Activity Detection</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically detect and flag suspicious session activity
                </p>
              </div>
              <Switch
                id="enableSuspiciousActivityDetection"
                checked={settings.enableSuspiciousActivityDetection}
                onCheckedChange={(checked) => setSettings(prev => ({
                  ...prev,
                  enableSuspiciousActivityDetection: checked
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
                <Label htmlFor="enableSessionCleanup">Enable Automatic Cleanup</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically clean up expired sessions
                </p>
              </div>
              <Switch
                id="enableSessionCleanup"
                checked={settings.enableSessionCleanup}
                onCheckedChange={(checked) => setSettings(prev => ({
                  ...prev,
                  enableSessionCleanup: checked
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
                How often to run session cleanup
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
              Session settings have been saved successfully.
            </AlertDescription>
          </Alert>
        )}

        {/* Security Information */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Security Notice:</strong> Session management is critical for security. 
            Consider the following best practices:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Set appropriate session timeouts based on your security requirements</li>
              <li>Limit concurrent sessions to prevent unauthorized access</li>
              <li>Enable suspicious activity detection to identify potential threats</li>
              <li>Regularly review and terminate suspicious sessions</li>
            </ul>
          </AlertDescription>
        </Alert>
      </div>

      {/* Active Sessions Management */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Active Sessions</h2>
        <SessionManagement onSessionTerminated={handleSessionTerminated} />
      </div>
    </div>
  );
}
