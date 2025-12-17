/**
 * IntegrationsModule - Centralized External API Gateway
 *
 * Provides circuit breaker protection for all external service calls.
 * Global module - available throughout the application.
 */

import { Module, Global } from '@nestjs/common';
import { IntegrationGateway } from './integration.gateway';

@Global()
@Module({
  providers: [IntegrationGateway],
  exports: [IntegrationGateway],
})
export class IntegrationsModule {}
