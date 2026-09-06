// src/email/constants/email.tokens.ts
//
// DI tokens for the email module's segregated contracts. Consumers — the BullMQ
// worker, the in-module event listeners, and the two external Level-3 modules
// (`reports`, `notifications`) — inject these symbols, never the concrete
// service/adapter classes. Symbols guarantee zero collision risk across the
// application graph.
//
// USAGE:
//   constructor(
//     @Inject(EMAIL_DISPATCH_TOKEN) private readonly email: IEmailDispatch,
//   ) {}

/**
 * Typed domain producers — `IEmailDispatch`.
 * The surface `reports/processors/scheduled-reports.processor.ts` and the
 * in-module event listeners consume.
 */
export const EMAIL_DISPATCH_TOKEN = Symbol('EMAIL_DISPATCH_TOKEN');

/**
 * Generic one-method producer — `IEmailSender`.
 * Segregated from dispatch so `EmailNotificationAdapter` (the notifications
 * module's `EmailTransportPort` binding) gets `send()` and nothing else.
 */
export const EMAIL_SENDER_TOKEN = Symbol('EMAIL_SENDER_TOKEN');

/** Per-recipient throttling — `IEmailRateLimiter`. Module-internal. */
export const EMAIL_RATE_LIMITER_TOKEN = Symbol('EMAIL_RATE_LIMITER_TOKEN');

/** Handlebars compile+cache — `IEmailTemplateRenderer`. Module-internal. */
export const EMAIL_TEMPLATE_RENDERER_TOKEN = Symbol(
  'EMAIL_TEMPLATE_RENDERER_TOKEN',
);

/**
 * The vendor seam — `IEmailTransport`. Bound `useClass: ResendEmailTransport`.
 * This is the swap point if the provider ever changes; see the port's docblock
 * for why a second implementation is NOT wanted today.
 */
export const EMAIL_TRANSPORT_TOKEN = Symbol('EMAIL_TRANSPORT_TOKEN');

/** O(1) job-name → composer lookup — `IEmailComposerRegistry`. Module-internal. */
export const EMAIL_COMPOSER_REGISTRY_TOKEN = Symbol(
  'EMAIL_COMPOSER_REGISTRY_TOKEN',
);

// NB: the outbound `DownloadLinkPort` is an abstract class in `../ports/`, used
// directly as its own DI token — not a symbol. An abstract class is both a
// runtime token and a type you can `extends`, which is how the S3 adapter binds.
// Same convention as the notifications module's transport ports.
