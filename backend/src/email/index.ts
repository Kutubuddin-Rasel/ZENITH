/**
 * Email Module — Public Barrel (SEALED, Step 3)
 *
 * STRICT BOUNDARY: only the ISP contracts, the DI tokens, and the outbound
 * `DownloadLinkPort` are exported here. The producer (`EmailDispatchService`),
 * the BullMQ worker (`EmailProcessor`), the composers and their registry, the
 * transport adapter (`ResendEmailTransport`), the Handlebars renderer, the rate
 * limiter, the link policy, the event listeners, the `.hbs` templates, and the
 * `EmailModule` class itself are module-internal and must be consumed
 * exclusively through the tokens below.
 *
 * Mirrors `notifications/index.ts` — same convention, same export discipline.
 * The former `EmailService` producer is GONE (Step 3); its surface now lives
 * behind `EMAIL_DISPATCH_TOKEN` (typed domain producers) and
 * `EMAIL_SENDER_TOKEN` (the generic channel that fulfils the notifications
 * module's `EmailTransportPort`).
 *
 * WHAT CONSUMERS ACTUALLY GET
 * ---------------------------
 *  - `reports`       → `EMAIL_DISPATCH_TOKEN` / `IEmailDispatch.sendReport`
 *  - `notifications` → `EMAIL_SENDER_TOKEN`   / `IEmailSender.send`
 *
 * That is the entire external surface. Everything else — invitation and
 * token-link delivery — is driven by domain events this module subscribes to,
 * so the emitting modules (`organizations`, `auth`) need no import at all.
 *
 * DELIBERATELY NOT EXPORTED
 * -------------------------
 *  - `services/*`    → bound behind the ISP tokens; never injected concretely.
 *  - `composers/*`   → per-job-name strategies, resolved through the registry.
 *  - `adapters/*`    → the Resend + S3 seams; no external code provides them.
 *  - `listeners/*`   → event plumbing, not injection targets.
 *  - `utils/*`       → pure helpers (link policy, subject sanitisation).
 *  - `templates/*`   → build assets, not code.
 *  - `email.processor` / `email-template.service` / `email-rate-limit.service`
 *                    → worker + internal collaborators.
 *  - `EmailModule`   → imported by direct path for DI membership; not re-exported.
 *
 * FULL SEAL, no entity exception: this module owns no TypeORM entity, so unlike
 * `issues`/`boards`/`sprints` there is nothing that must stay deep-importable.
 *
 * To add a new public surface: add an interface to
 * `interfaces/email.interfaces.ts` and a token to `constants/email.tokens.ts`.
 * Never re-export a class from here.
 */

export * from './interfaces/email.interfaces';
export * from './constants/email.tokens';

// Outbound port — an abstract class used directly as its own DI token. Exported
// so a future non-S3 artifact backend could bind it without reaching inside.
export { DownloadLinkPort } from './ports/download-link.port';
