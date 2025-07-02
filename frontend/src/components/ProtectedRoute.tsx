"use client";

import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';
import Spinner from './Spinner';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log('ProtectedRoute state:', { user, token, loading });
    if (!loading && (!token || !user)) {
      router.replace('/auth/login');
    }
  }, [loading, token, user, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!token || !user) return null;

  return <>{children}</>;
};

export default ProtectedRoute; 