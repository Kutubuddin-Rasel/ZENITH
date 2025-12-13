export interface AuditLogEvent {
  event_uuid: string;
  id?: string; // Add alias for worker compatibility
  timestamp: Date;
  tenant_id: string; // Organization ID
  projectId?: string; // Alias
  actor_id: string;
  userId?: string; // Alias
  actor_ip?: string;
  resource_type: string; // 'Issue', 'Project', etc.
  entityType?: string; // Alias
  resource_id: string;
  entityId?: string; // Alias
  action_type: 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW' | 'LOGIN' | 'LOGOUT';
  action?: string; // Alias
  changes?: Record<string, [string, string]>; // { field: [old, new] }
  metadata?: Record<string, any>;
}
