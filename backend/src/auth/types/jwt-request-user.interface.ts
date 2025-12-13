export interface JwtRequestUser {
  userId: string;
  email: string;
  isSuperAdmin: boolean;
  name: string;
  organizationId?: string; // Added for workspace context
}
