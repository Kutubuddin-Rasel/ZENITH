"use client";
import React, { useEffect, useState } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/context/AuthContext';

export default function TestNotificationsPage() {
  const { user, token } = useAuth();
  const { notifications, isLoading, isError } = useNotifications();
  const [apiResponse, setApiResponse] = useState<unknown>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    const testNotificationAPI = async () => {
      try {
        console.log('🔍 Testing notification API...');
        console.log('User:', user);
        console.log('Token:', token);
        
        const response = await fetch('http://localhost:3000/notifications', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ API Response:', data);
          setApiResponse(data);
        } else {
          const errorText = await response.text();
          console.error('❌ API Error:', errorText);
          setApiError(errorText);
        }
      } catch (error) {
        console.error('❌ Fetch error:', error);
        setApiError(error instanceof Error ? error.message : 'Unknown error');
      }
    };

    if (token) {
      testNotificationAPI();
    }
  }, [token, user]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Notification System Test</h1>
      
      <div className="space-y-4">
        <div className="bg-neutral-100 p-4 rounded">
          <h2 className="font-semibold">Authentication Status</h2>
          <p>User: {user ? `${user.name} (${user.email})` : 'Not logged in'}</p>
          <p>Token: {token ? 'Present' : 'Missing'}</p>
        </div>

        <div className="bg-neutral-100 p-4 rounded">
          <h2 className="font-semibold">Direct API Test</h2>
          {apiError && (
            <div className="text-red-600">
              <p>Error: {apiError}</p>
            </div>
          )}
          {apiResponse !== null && (
            <div className="text-green-600">
              <p>Success! Response:</p>
              <pre className="bg-white p-2 rounded text-sm overflow-auto">
                {typeof apiResponse === 'object' ? JSON.stringify(apiResponse, null, 2) : String(apiResponse)}
              </pre>
            </div>
          )}
        </div>

        <div className="bg-neutral-100 p-4 rounded">
          <h2 className="font-semibold">React Query Hook Test</h2>
          <p>Loading: {isLoading ? 'Yes' : 'No'}</p>
          <p>Error: {isError ? 'Yes' : 'No'}</p>
          <p>Notifications count: {notifications?.length || 0}</p>
          {notifications && notifications.length > 0 && (
            <div className="mt-2">
              <h3 className="font-medium">Notifications:</h3>
              <pre className="bg-white p-2 rounded text-sm overflow-auto">
                {JSON.stringify(notifications, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 