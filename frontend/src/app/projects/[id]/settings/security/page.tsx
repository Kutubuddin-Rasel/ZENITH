"use client";
import React, { useState } from "react";
import TwoFactorAuthManagement from "../../../../../components/TwoFactorAuthManagement";
import SAMLConfiguration from "../../../../../components/SAMLConfiguration";
import Typography from "../../../../../components/Typography";
import Card from "../../../../../components/Card";
import Button from "../../../../../components/Button";
import { ShieldCheckIcon, KeyIcon, LockClosedIcon, CogIcon } from "@heroicons/react/24/outline";

export default function SecuritySettingsPage() {
  const [showSAMLConfig, setShowSAMLConfig] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <Typography variant="h1" className="mb-2">
          Security Settings
        </Typography>
        <Typography variant="body" className="text-gray-600 dark:text-gray-400">
          Manage your account security and authentication settings
        </Typography>
      </div>

      {/* Two-Factor Authentication */}
      <TwoFactorAuthManagement />

      {/* SAML/SSO Configuration */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <CogIcon className="h-6 w-6 text-blue-600" />
            <Typography variant="h3">SAML/SSO Integration</Typography>
          </div>
          <Button onClick={() => setShowSAMLConfig(true)}>
            <CogIcon className="h-5 w-5 mr-2" />
            Manage SAML
          </Button>
        </div>

        <Typography variant="body" className="text-gray-600 dark:text-gray-400 mb-4">
          Configure Single Sign-On (SSO) integration with your organization&apos;s identity provider like Active Directory, Okta, or Azure AD.
        </Typography>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <Typography variant="body" className="text-blue-800 dark:text-blue-200 text-sm">
            <strong>Enterprise Feature:</strong> SAML/SSO allows users to sign in using their organization&apos;s existing credentials, 
            providing seamless access and centralized user management.
          </Typography>
        </div>
      </Card>

      {/* Security Information */}
      <Card className="p-6">
        <div className="flex items-center space-x-3 mb-4">
          <ShieldCheckIcon className="h-6 w-6 text-blue-600" />
          <Typography variant="h3">Security Best Practices</Typography>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <KeyIcon className="h-5 w-5 text-green-600 mt-1" />
            <div>
              <Typography variant="h4" className="text-sm font-medium">
                Use Strong Passwords
              </Typography>
              <Typography variant="body" className="text-sm text-gray-600 dark:text-gray-400">
                Use a unique, complex password with at least 12 characters including numbers, symbols, and mixed case letters.
              </Typography>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <LockClosedIcon className="h-5 w-5 text-green-600 mt-1" />
            <div>
              <Typography variant="h4" className="text-sm font-medium">
                Enable Two-Factor Authentication
              </Typography>
              <Typography variant="body" className="text-sm text-gray-600 dark:text-gray-400">
                Add an extra layer of security by requiring a verification code from your mobile device.
              </Typography>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <ShieldCheckIcon className="h-5 w-5 text-green-600 mt-1" />
            <div>
              <Typography variant="h4" className="text-sm font-medium">
                Keep Your Device Secure
              </Typography>
              <Typography variant="body" className="text-sm text-gray-600 dark:text-gray-400">
                Ensure your device is protected with a screen lock and keep your authenticator app updated.
              </Typography>
            </div>
          </div>
        </div>
      </Card>

      {/* Session Information */}
      <Card className="p-6">
        <div className="flex items-center space-x-3 mb-4">
          <LockClosedIcon className="h-6 w-6 text-blue-600" />
          <Typography variant="h3">Active Sessions</Typography>
        </div>
        
        <Typography variant="body" className="text-gray-600 dark:text-gray-400 mb-4">
          You are currently signed in on this device. For security reasons, we don&apos;t show detailed session information.
        </Typography>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <Typography variant="body" className="text-yellow-800 dark:text-yellow-200 text-sm">
            <strong>Security Tip:</strong> If you notice any suspicious activity on your account, 
            immediately change your password and review your 2FA settings.
          </Typography>
        </div>
      </Card>

      {/* SAML Configuration Modal */}
      <SAMLConfiguration
        isOpen={showSAMLConfig}
        onClose={() => setShowSAMLConfig(false)}
      />
    </div>
  );
}
