export interface AuthenticatedRequest {
  user: {
    id: string; // Alias for userId (backward compatibility)
    userId: string;
    email: string;
    name: string;
    isSuperAdmin: boolean;
    organizationId?: string;
  };
  ip?: string;
  headers?: {
    'user-agent'?: string;
    [key: string]: string | string[] | undefined;
  };
  sessionID?: string;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string | string[] | undefined>;
}
