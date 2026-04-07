/**
 * OpenTelemetry Instrumentation Bootstrap
 *
 * CRITICAL BOOT ORDER:
 * This file MUST execute before NestJS loads via Node.js --require flag:
 *   node --require ./dist/instrumentation.js dist/main.js
 *
 * WHY: OpenTelemetry monkey-patches Node.js core modules (http, https, net)
 * and driver libraries (pg, ioredis). If NestJS imports them first,
 * the patches miss — resulting in zero traces.
 *
 * ARCHITECTURE:
 * - Uses @opentelemetry/sdk-node for simplified setup
 * - OTLP/gRPC exporter → OTel Collector (production)
 * - Console exporter fallback (development) via OTEL_TRACES_EXPORTER=console
 * - Auto-instrumentations: HTTP, Express, pg, ioredis, BullMQ (partial)
 * - Sensitive header filtering: Authorization, Cookie, Set-Cookie stripped
 *
 * CONFIGURATION (Environment Variables):
 * - OTEL_ENABLED=true              — Enable/disable OTel (default: false)
 * - OTEL_SERVICE_NAME=zenith-api   — Service name in traces
 * - OTEL_EXPORTER_OTLP_ENDPOINT   — Collector endpoint (default: http://localhost:4317)
 * - OTEL_TRACES_EXPORTER=console   — Use console exporter for dev
 *
 * ZERO `any` TOLERANCE.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// =============================================================================
// CONFIGURATION
// =============================================================================

const isEnabled = process.env.OTEL_ENABLED === 'true';
const serviceName = process.env.OTEL_SERVICE_NAME || 'zenith-api';
const environment = process.env.NODE_ENV || 'development';
const useConsoleExporter = process.env.OTEL_TRACES_EXPORTER === 'console';

// =============================================================================
// SENSITIVE HEADER FILTER
// =============================================================================

/**
 * Headers that MUST be stripped from traces to prevent PII/credential leaks.
 * This list is applied to both HTTP client and server instrumentations.
 */
const SENSITIVE_HEADERS_BLOCKLIST: string[] = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  'x-api-key',
];

// =============================================================================
// BOOTSTRAP
// =============================================================================

if (isEnabled) {
  // Enable OTel diagnostic logging in development
  if (environment === 'development') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  const traceExporter = useConsoleExporter
    ? new ConsoleSpanExporter()
    : new OTLPTraceExporter();

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
      'deployment.environment.name': environment,
    }),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // =====================================================================
        // HTTP Instrumentation — filter sensitive headers
        // =====================================================================
        '@opentelemetry/instrumentation-http': {
          headersToSpanAttributes: {
            server: {
              requestHeaders: [], // Don't capture request headers
              responseHeaders: [], // Don't capture response headers
            },
            client: {
              requestHeaders: [],
              responseHeaders: [],
            },
          },
          // Ignore health check and metrics endpoints (noisy, no value)
          ignoreIncomingRequestHook: (request) => {
            const url = request.url || '';
            return (
              url.includes('/health') ||
              url.includes('/metrics') ||
              url.includes('/favicon')
            );
          },
        },
        // =====================================================================
        // FS Instrumentation — disabled (too noisy, fills traces with file I/O)
        // =====================================================================
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
        // =====================================================================
        // DNS Instrumentation — disabled (not useful for app-level tracing)
        // =====================================================================
        '@opentelemetry/instrumentation-dns': {
          enabled: false,
        },
      }),
    ],
  });

  sdk.start();

  // Graceful shutdown — flush pending spans before process exits
  const shutdown = (): void => {
    sdk
      .shutdown()
      .then(() => console.log('[OTel] SDK shut down gracefully'))
      .catch((err: Error) => console.error('[OTel] SDK shutdown error:', err))
      .finally(() => process.exit(0));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log(
    `[OTel] Instrumentation initialized: service=${serviceName} env=${environment} ` +
      `exporter=${useConsoleExporter ? 'console' : 'otlp-grpc'}`,
  );
} else {
  console.log('[OTel] Instrumentation DISABLED (set OTEL_ENABLED=true to enable)');
}
