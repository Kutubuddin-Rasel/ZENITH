"use client";
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../lib/fetcher';
import { connectSocket } from '../lib/socket';
import { safeLocalStorage } from '../lib/safe-local-storage';

type User = {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  isSuperAdmin?: boolean;
  organizationId?: string;
};

interface ProjectMembership {
  projectId: string;
  roleName: string;
}

interface AuthContextProps {
  user: User | null;
  token: string | null;
  loading: boolean;
  isSuperAdmin: boolean;
  projectRoles: { [projectId: string]: string };
  login: (email: string, password: string, redirectPath?: string) => Promise<void>;
  register: (email: string, password: string, name?: string, workspaceName?: string, redirectPath?: string) => Promise<void>;
  logout: () => void;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Token state removed as it is now HttpOnly cookie
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [projectRoles, setProjectRoles] = useState<{ [projectId: string]: string }>({});
  const router = useRouter();

  const fetchUserData = async () => {
    try {
      // Fetch user profile - Cookie is sent automatically
      const userData = await apiFetch<{
        userId: string;
        email: string;
        isSuperAdmin: boolean;
        name: string;
        avatarUrl?: string;
        organizationId?: string;
      }>('/auth/me');

      const mappedUser = {
        id: userData.userId,
        email: userData.email,
        name: userData.name,
        avatarUrl: userData.avatarUrl,
        isSuperAdmin: userData.isSuperAdmin,
        organizationId: userData.organizationId
      };

      setUser(mappedUser);
      setIsSuperAdmin(!!userData.isSuperAdmin);

      // Update local storage with fresh user data (ignoring token)
      safeLocalStorage.setItem('user_data', JSON.stringify(mappedUser));

      // If super-admin, skip memberships fetch
      if (userData.isSuperAdmin) {
        setProjectRoles({});
      } else {
        // Fetch project memberships
        try {
          const memberships = await apiFetch<ProjectMembership[]>('/users/me/project-memberships');

          const roles: { [projectId: string]: string } = {};
          memberships.forEach((m: ProjectMembership) => {
            roles[m.projectId] = m.roleName;
          });
          setProjectRoles(roles);
        } catch (membershipError) {
          console.error('Failed to fetch project memberships:', membershipError);
          setProjectRoles({});
        }
      }

      // Connect to notifications socket (Socket needs cookie auth or ticket)
      // For now, let's assume socket auth needs potential refactor if it depended on Bearer.
      // But typically sockets use cookies too if on same domain.
      await connectSocket(null, userData.userId);

    } catch (err) {
      console.error('Failed to fetch user data:', err);
      if (err instanceof Response) {
        const text = await err.text();
        console.error('Response body:', text);
      }
      setUser(null);
      setIsSuperAdmin(false);
      setProjectRoles({});
      // safeLocalStorage.removeItem('access_token'); // Gone
    }
  };

  const refreshUserData = async () => {
    await fetchUserData();
  };

  useEffect(() => {
    // Initial load check
    const storedUserData = safeLocalStorage.getItem('user_data');

    // Optimistically set user from storage if available
    if (storedUserData) {
      try {
        const parsedUser = JSON.parse(storedUserData);
        setUser(parsedUser);
        setIsSuperAdmin(!!parsedUser.isSuperAdmin);
      } catch (e) {
        console.error('Failed to parse stored user data', e);
      }
    }

    setLoading(true);
    // Attempt to hit /auth/me. If cookies are valid, it works.
    fetchUserData().finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string, redirectPath?: string) => {
    setLoading(true);
    try {
      // Login sets cookies - but may require 2FA first
      const data = await apiFetch<{
        user?: User;
        requires2FA?: boolean;
        userId?: string;
        message?: string;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      // Check if 2FA is required
      if (data.requires2FA && data.userId) {
        // Throw a special error that the login page can catch
        const error = new Error('2FA_REQUIRED') as Error & { userId: string };
        error.userId = data.userId;
        throw error;
      }

      // Normal login flow (no 2FA or 2FA already verified)
      if (!data.user) {
        throw new Error('Invalid response from server');
      }

      console.log('Login successful, setting user data:', data.user);

      // No token to store
      // safeLocalStorage.setItem('access_token', data.access_token);
      safeLocalStorage.setItem('user_data', JSON.stringify(data.user));

      setUser(data.user);
      setIsSuperAdmin(!!data.user.isSuperAdmin);

      // Fetch complete user data including roles (async, but UI is unlocked)
      fetchUserData();

      router.push(redirectPath || '/projects');
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string, name?: string, workspaceName?: string, redirectPath?: string) => {
    setLoading(true);
    try {
      // Registration returns user data, we need to login after
      await apiFetch<{ id: string; email: string; name: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name, workspaceName }),
      });

      // After successful registration, login to get cookies
      await login(email, password, redirectPath);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await apiFetch('/auth/logout'); // Call backend to clear cookies
    } catch (e) {
      console.error('Logout failed', e);
    }
    // safeLocalStorage.removeItem('access_token');
    setUser(null);
    setIsSuperAdmin(false);
    setProjectRoles({});
    router.push('/auth/login');
  };

  return (
    <AuthContext.Provider value={{
      user,
      token: null, // Computed property if needed, but we don't have it.
      loading,
      isSuperAdmin,
      projectRoles,
      login,
      register,
      logout,
      refreshUserData
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}