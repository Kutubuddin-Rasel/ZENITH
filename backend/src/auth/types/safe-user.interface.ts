export interface SafeUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  organizationId?: string; // Added for workspace context
  avatarUrl?: string; // Profile picture URL
  passwordVersion?: number; // Added for session invalidation on password change
}
