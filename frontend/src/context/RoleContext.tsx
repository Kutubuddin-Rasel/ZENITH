"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiFetch } from '../lib/fetcher';
import { useAuth } from './AuthContext';

interface RoleContextType {
  isSuperAdmin: boolean;
  projectRoles: { [projectId: string]: string };
  loading: boolean;
  refreshRoles: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export const RoleProvider = ({ children }: { children: ReactNode }) => {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [projectRoles, setProjectRoles] = useState<{ [projectId: string]: string }>({});
  const [loading, setLoading] = useState(true);

  const { user } = useAuth();

  // Sync SuperAdmin state from AuthContext immediately
  useEffect(() => {
    if (user) {
      setIsSuperAdmin(!!user.isSuperAdmin);
    }
  }, [user]);

  // Wrap in useCallback to prevent infinite loop
  const refreshRoles = React.useCallback(async () => {
    setLoading(true);
    try {
      if (!user) return;

      // If already super admin from AuthContext, we technically don't need to fetch 'me' again
      // just to check isSuperAdmin, but let's trust AuthContext.
      // However, we still might need project memberships if they are NOT a super admin.

      setIsSuperAdmin(!!user.isSuperAdmin);

      if (user.isSuperAdmin) {
        setProjectRoles({});
      } else {
        // Use apiFetch so cookies are automatically included
        try {
          const memberships = await apiFetch<{ projectId: string; roleName: string }[]>('/users/me/project-memberships');
          const roles: { [projectId: string]: string } = {};
          memberships.forEach((m) => {
            roles[m.projectId] = m.roleName;
          });
          setProjectRoles(roles);
        } catch (err) {
          console.error('Failed to fetch memberships', err);
        }
      }
    } catch (e) {
      console.error('Role refresh failed', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch roles when user is loaded
  useEffect(() => {
    if (user) {
      refreshRoles();
    } else {
      setProjectRoles({});
      setIsSuperAdmin(false);
      setLoading(false);
    }
  }, [user, refreshRoles]);

  return (
    <RoleContext.Provider value={{ isSuperAdmin, projectRoles, loading, refreshRoles }}>
      {children}
    </RoleContext.Provider>
  );
};

export const useRole = () => {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
};

export const useProjectRole = (projectId: string) => {
  const { projectRoles, isSuperAdmin } = useRole();
  // If user is Super-Admin, return 'Super-Admin' for any project
  if (isSuperAdmin) {
    return 'Super-Admin';
  }
  return projectRoles[projectId] || null;
}; 