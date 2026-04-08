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
 * - SanitizingExporter: wraps the real exporter to scrub PII from spans
 *
 * SECURITY (Red Team Patch 3):
 * - Database queries (db.statement) are REDACTED to prevent PII leakage
 * - HTTP headers, URL query params, and auth attributes are scrubbed
 * - Defense-in-depth: HTTP instrumentation also configured to skip headers
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
import {
  ConsoleSpanExporter,
  ReadableSpan,
  SpanExporter,
} from '@opentelemetry/sdk-trace-node';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// =============================================================================
// CONFIGURATION
// =============================================================================

const isEnabled = process.env.OTEL_ENABLED === 'true';
const serviceName = process.env.OTEL_SERVICE_NAME || 'zenith-api';
const environment = process.env.NODE_ENV || 'development';
const useConsoleExporter = process.env.OTEL_TRACES_EXPORTER === 'console';

// =============================================================================
// SENSITIVE ATTRIBUTE PATTERNS (Red Team Patch 3)
// =============================================================================

/**
 * Regex patterns for span attribute keys that MUST be scrubbed.
 *
 * ATTACK VECTOR:
 * Auto-instrumentations (pg, express, http) capture raw SQL queries,
 * HTTP headers, and URL query parameters. If a query contains an email,
 * or a URL contains a JWT in a query param, it leaks into Jaeger/Zipkin.
 *
 * DEFENSE:
 * Any attribute matching these patterns has its value replaced with [REDACTED].
 */
const SENSITIVE_ATTR_PATTERNS: RegExp[] = [
  // Database: pg instrumentation captures full SQL statements
  /^db\.statement$/,
  /^db\.query\.text$/,

  // HTTP headers that might slip through despite empty header config
  /^http\.request\.header\./,
  /^http\.response\.header\./,

  // URL query params (may contain tokens, emails, etc.)
  /^http\.url$/,
  /^url\.full$/,

  // Authentication/session attributes
  /^http\.request\.header\.authorization$/,
  /^http\.request\.header\.cookie$/,
  /^http\.request\.header\.set-cookie$/,
  /^http\.request\.header\.x-api-key$/,
  /^http\.request\.header\.x-csrf-token$/,
];

/**
 * Attributes that should have query strings stripped (not fully redacted).
 * We keep the path for debugging but strip query params.
 */
const URL_STRIP_PATTERNS: RegExp[] = [/^http\.target$/, /^url\.path$/];

// =============================================================================
// SANITIZING EXPORTER (Defense-in-Depth)
// =============================================================================

/**
 * SanitizingExporter — Wraps a real SpanExporter to scrub sensitive data.
 *
 * WHY NOT a SpanProcessor?
 * - `onEnd(ReadableSpan)` receives a read-only interface — can't modify
 * - `onStart(Span)` fires before all attributes are set
 * - Wrapping the exporter intercepts spans at the last possible moment
 *   before they leave the Node.js process boundary
 *
 * This is the standard pattern used by Datadog, Honeycomb, and Grafana
 * Cloud agents for pre-export data scrubbing.
 */
class SanitizingExporter implements SpanExporter {
  constructor(private readonly delegate: SpanExporter) {}

  export(
    spans: ReadableSpan[],
    resultCallback: (result: { code: number }) => void,
  ): void {
    for (const span of spans) {
      this.redactSpan(span);
    }
    this.delegate.export(spans, resultCallback);
  }

  async shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

  async forceFlush(): Promise<void> {
    if (this.delegate.forceFlush) {
      return this.delegate.forceFlush();
    }
  }

  /**
   * Scrub sensitive attributes from a span in-place.
   *
   * ReadableSpan.attributes is typed as readonly, but the underlying
   * object IS mutable. This is the accepted OTel community pattern
   * for pre-export redaction.
   */
  private redactSpan(span: ReadableSpan): void {
    const attrs = span.attributes as Record<
      string,
      string | number | boolean | undefined
    >;

    for (const key of Object.keys(attrs)) {
      // Full redaction: replace value entirely
      if (SENSITIVE_ATTR_PATTERNS.some((pattern) => pattern.test(key))) {
        attrs[key] = '[REDACTED]';
        continue;
      }

      // URL strip: keep path, remove query string
      if (URL_STRIP_PATTERNS.some((pattern) => pattern.test(key))) {
        const value = attrs[key];
        if (typeof value === 'string' && value.includes('?')) {
          attrs[key] = value.split('?')[0] + '?[REDACTED]';
        }
      }
    }
  }
}

// =============================================================================
// BOOTSTRAP
// =============================================================================

if (isEnabled) {
  // Enable OTel diagnostic logging in development
  if (environment === 'development') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  const rawExporter = useConsoleExporter
    ? new ConsoleSpanExporter()
    : new OTLPTraceExporter();

  // Wrap the real exporter with PII scrubbing
  const sanitizedExporter = new SanitizingExporter(rawExporter);

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
      'deployment.environment.name': environment,
    }),
    traceExporter: sanitizedExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // =====================================================================
        // HTTP Instrumentation — defense-in-depth header blocking
        // Even though SanitizingExporter scrubs, we also prevent capture.
        // =====================================================================
        '@opentelemetry/instrumentation-http': {
          headersToSpanAttributes: {
            server: {
              requestHeaders: [],
              responseHeaders: [],
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
      `exporter=${useConsoleExporter ? 'console' : 'otlp-grpc'} redaction=ENABLED`,
  );
} else {
  console.log(
    '[OTel] Instrumentation DISABLED (set OTEL_ENABLED=true to enable)',
  );
}
