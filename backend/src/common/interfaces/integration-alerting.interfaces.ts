/**
 * Integration Alerting Orchestrator Contract.
 *
 * The integration-domain orchestrator that depends on `Repository<Integration>`,
 * `IAlertDispatcher`, and `IFailureTracker`. The concrete implementation lives
 * in `src/integrations/services/integration-alert.service.ts` (the `integrations`
 * module rightfully owns the `Integration` entity).
 *
 * Any cross-module consumer resolves this token at runtime via
 * `ModuleRef.get(token, { strict: false })` so `common` never has to
 * upward-import `IntegrationsModule`.
 */

export interface AlertSummaryEntry {
  integrationId: string;
  integrationType: string;
  severity: string;
  message: string;
}

export interface AlertSummary {
  total: number;
  critical: number;
  warning: number;
  healthy: number;
  alerts: AlertSummaryEntry[];
}

export interface IIntegrationAlertOrchestrator {
  checkIntegrationHealth(integrationId: string): Promise<void>;
  recordSyncFailure(integrationId: string): Promise<number>;
  recordSyncSuccess(integrationId: string): Promise<void>;
  getFailureCount(integrationId: string): Promise<number>;
  getAlertSummary(): Promise<AlertSummary>;
}
