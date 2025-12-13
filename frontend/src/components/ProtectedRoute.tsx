"use client";

import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';
import Spinner from './Spinner';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Token is now HttpOnly cookie, so we only check if user is loaded
    if (!loading && !user) {
      router.replace('/auth/login');
    }
  }, [loading, user, router /* token removed */]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!user && !loading) return null; // Wait for redirect

  return <>{children}</>;
};

export default ProtectedRoute; 