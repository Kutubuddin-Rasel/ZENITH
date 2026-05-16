/**
 * Integration Alerting Orchestrator Token.
 *
 * Bound by `IntegrationsModule` to the concrete `IntegrationAlertService`.
 * Resolvable across module boundaries via `ModuleRef.get(token,
 * { strict: false })` so `common` does not import `integrations`.
 */
export const INTEGRATION_ALERT_ORCHESTRATOR_TOKEN: unique symbol = Symbol(
  'INTEGRATION_ALERT_ORCHESTRATOR_TOKEN',
);
