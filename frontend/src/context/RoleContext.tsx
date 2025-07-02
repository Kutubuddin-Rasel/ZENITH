"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

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

  // Fetch roles on mount
  useEffect(() => {
    refreshRoles();
    // eslint-disable-next-line
  }, []);

  const refreshRoles = async () => {
    setLoading(true);
    try {
      // Get JWT token from localStorage (or cookies if you use cookies)
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      if (!token) throw new Error('No access token found');
      // Fetch /auth/me for user info and isSuperAdmin
      const meRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!meRes.ok) throw new Error('Failed to fetch user info');
      const me = await meRes.json();
      console.log('RoleContext: /auth/me response:', me);
      console.log('RoleContext: me.isSuperAdmin:', me.isSuperAdmin);
      setIsSuperAdmin(!!me.isSuperAdmin);
      console.log('RoleContext: Setting isSuperAdmin to:', !!me.isSuperAdmin);
      // If super-admin, skip memberships fetch
      if (me.isSuperAdmin) {
        setProjectRoles({});
        setLoading(false);
        return;
      }

      // Fetch memberships from the new endpoint
      const membershipsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/me/project-memberships`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!membershipsRes.ok) throw new Error('Failed to fetch memberships');
      const memberships = await membershipsRes.json();
      const roles: { [projectId: string]: string } = {};
      memberships.forEach((m: any) => {
        roles[m.projectId] = m.roleName;
      });
      setProjectRoles(roles);
    } catch (e) {
      setIsSuperAdmin(false);
      setProjectRoles({});
    } finally {
      setLoading(false);
    }
  };

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