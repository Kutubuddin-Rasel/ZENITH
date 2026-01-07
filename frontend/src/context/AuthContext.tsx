"use client";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../lib/fetcher';
import { connectSocket } from '../lib/socket';
import { safeLocalStorage } from '../lib/safe-local-storage';
import { usePremiumToast } from '@/hooks/use-premium-toast';
import {
  setAccessToken,
  clearAccessToken,
  tryRestoreSession,
  onTokenChangeCallback,
  onAuthErrorCallback,
  getAccessToken,
} from '../lib/auth-tokens';

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
  login: (
    email: string,
    password: string,
    redirectPath?: string
  ) => Promise<void>;
  register: (
    email: string,
    password: string,
    name?: string,
    workspaceName?: string,
    redirectPath?: string
  ) => Promise<void>;
  logout: () => void;
  refreshUserData: () => Promise<void>;
}

// Error type for 2FA flow
interface TwoFactorError extends Error {
  twoFactorSessionToken?: string;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [projectRoles, setProjectRoles] = useState<{
    [projectId: string]: string;
  }>({});
  const router = useRouter();
  const { toast } = usePremiumToast();

  const fetchUserData = useCallback(async () => {
    try {
      // Fetch user profile - Bearer token added by api-client
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
        organizationId: userData.organizationId,
      };

      setUser(mappedUser);
      setIsSuperAdmin(!!userData.isSuperAdmin);

      // Update local storage with fresh user data
      safeLocalStorage.setItem('user_data', JSON.stringify(mappedUser));

      // If super-admin, skip memberships fetch
      if (userData.isSuperAdmin) {
        setProjectRoles({});
      } else {
        // Fetch project memberships
        try {
          const memberships = await apiFetch<ProjectMembership[]>(
            '/users/me/project-memberships'
          );

          const roles: { [projectId: string]: string } = {};
          memberships.forEach((m: ProjectMembership) => {
            roles[m.projectId] = m.roleName;
          });
          setProjectRoles(roles);
        } catch (membershipError) {
          console.error(
            'Failed to fetch project memberships:',
            membershipError
          );
          setProjectRoles({});
        }
      }

      // Connect to notifications socket
      await connectSocket(null, userData.userId);
    } catch (err) {
      console.error('Failed to fetch user data:', err);
      setUser(null);
      setIsSuperAdmin(false);
      setProjectRoles({});
    }
  }, []);

  const refreshUserData = useCallback(async () => {
    await fetchUserData();
  }, [fetchUserData]);

  // Handle auth errors (token refresh failures)
  const handleAuthError = useCallback(() => {
    setUser(null);
    setToken(null);
    setIsSuperAdmin(false);
    setProjectRoles({});
    safeLocalStorage.removeItem('user_data');
    router.push('/auth/login?expired=true');
  }, [router]);

  useEffect(() => {
    // Subscribe to token changes
    const unsubToken = onTokenChangeCallback((newToken) => {
      setToken(newToken);
    });

    // Subscribe to auth errors
    const unsubError = onAuthErrorCallback(handleAuthError);

    // Initialize: Try to restore session from refresh cookie
    const initAuth = async () => {
      setLoading(true);

      // Optimistically set user from storage
      const storedUserData = safeLocalStorage.getItem('user_data');
      if (storedUserData) {
        try {
          const parsedUser = JSON.parse(storedUserData);
          setUser(parsedUser);
          setIsSuperAdmin(!!parsedUser.isSuperAdmin);
        } catch (e) {
          console.error('Failed to parse stored user data', e);
        }
      }

      // Try to get a fresh access token via refresh cookie
      const restored = await tryRestoreSession();

      if (restored) {
        // Fetch full user data
        await fetchUserData();
      } else {
        // No valid session - clear any stale data
        setUser(null);
        setIsSuperAdmin(false);
        setProjectRoles({});
      }

      setLoading(false);
    };

    initAuth();

    return () => {
      unsubToken();
      unsubError();
    };
  }, [fetchUserData, handleAuthError]);

  const login = useCallback(
    async (email: string, password: string, redirectPath?: string) => {
      setLoading(true);
      try {
        // Login - may require 2FA
        const data = await apiFetch<{
          access_token?: string;
          user?: User;
          requires2FA?: boolean;
          twoFactorSessionToken?: string; // NEW: Signed session token
          message?: string;
        }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });

        // Check if 2FA is required
        if (data.requires2FA && data.twoFactorSessionToken) {
          // Throw a special error that the login page can catch
          const error = new Error('2FA_REQUIRED') as TwoFactorError;
          error.twoFactorSessionToken = data.twoFactorSessionToken;
          throw error;
        }

        // Normal login flow (no 2FA or 2FA already verified)
        if (!data.user || !data.access_token) {
          throw new Error('Invalid response from server');
        }

        // Store access token in memory
        setAccessToken(data.access_token);

        // Store user data
        safeLocalStorage.setItem('user_data', JSON.stringify(data.user));

        setUser(data.user);
        setIsSuperAdmin(!!data.user.isSuperAdmin);

        // Fetch complete user data including roles
        fetchUserData();

        // Success toast
        toast.success('Logged in successfully', 'Welcome back to Zenith');

        router.push(redirectPath || '/projects');
      } finally {
        setLoading(false);
      }
    },
    [router, toast, fetchUserData]
  );

  const register = useCallback(
    async (
      email: string,
      password: string,
      name?: string,
      workspaceName?: string,
      redirectPath?: string
    ) => {
      setLoading(true);
      try {
        // Registration returns user data
        await apiFetch<{ id: string; email: string; name: string }>(
          '/auth/register',
          {
            method: 'POST',
            body: JSON.stringify({ email, password, name, workspaceName }),
          }
        );

        // After successful registration, login to get tokens
        await login(email, password, redirectPath);
      } finally {
        setLoading(false);
      }
    },
    [login]
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout failed', e);
    }

    // Clear in-memory token
    clearAccessToken();

    // Clear local state
    safeLocalStorage.removeItem('user_data');
    setUser(null);
    setIsSuperAdmin(false);
    setProjectRoles({});

    router.push('/auth/login');
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isSuperAdmin,
        projectRoles,
        login,
        register,
        logout,
        refreshUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Export for use in TwoFactorAuthVerification
export type { TwoFactorError };