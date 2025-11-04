"use client";
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../lib/fetcher';
import { connectSocket } from '../lib/socket';

type User = {
  id: string;
  email: string;
  name?: string;
  isSuperAdmin?: boolean;
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
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [projectRoles, setProjectRoles] = useState<{ [projectId: string]: string }>({});
  const router = useRouter();

  const fetchUserData = async (authToken: string) => {
    try {
      // Fetch user profile
      const userData = await apiFetch<{ 
        userId: string; 
        email: string; 
        isSuperAdmin: boolean; 
        name: string 
      }>('/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      const mappedUser = { 
        id: userData.userId, 
        email: userData.email, 
        name: userData.name,
        isSuperAdmin: userData.isSuperAdmin 
      };
      
      setUser(mappedUser);
      setIsSuperAdmin(!!userData.isSuperAdmin);

      // If super-admin, skip memberships fetch
      if (userData.isSuperAdmin) {
        setProjectRoles({});
      } else {
        // Fetch project memberships
        try {
          const memberships = await apiFetch<ProjectMembership[]>('/users/me/project-memberships', {
            headers: { Authorization: `Bearer ${authToken}` },
          });
          
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

      // Connect to notifications socket
      connectSocket(authToken, userData.userId);
      
    } catch (err) {
      console.error('Failed to fetch user data:', err);
      if (err instanceof Response) {
        const text = await err.text();
        console.error('Response body:', text);
      }
      setUser(null);
      setToken(null);
      setIsSuperAdmin(false);
      setProjectRoles({});
      localStorage.removeItem('access_token');
    }
  };

  const refreshUserData = async () => {
    if (token) {
      await fetchUserData(token);
    }
  };

  useEffect(() => {
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (storedToken) {
      setToken(storedToken);
      setLoading(true);
      fetchUserData(storedToken).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const data = await apiFetch<{ access_token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('access_token', data.access_token);
      setToken(data.access_token);
      setUser(data.user);
      
      // Fetch complete user data including roles
      await fetchUserData(data.access_token);
      
      router.push('/projects');
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string, name?: string) => {
    setLoading(true);
    try {
      const data = await apiFetch<{ access_token: string; user: User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
      });
      localStorage.setItem('access_token', data.access_token);
      setToken(data.access_token);
      setUser(data.user);
      
      // Fetch complete user data including roles
      await fetchUserData(data.access_token);
      
      router.push('/projects');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    setToken(null);
    setUser(null);
    setIsSuperAdmin(false);
    setProjectRoles({});
    router.push('/auth/login');
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
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