// src/email/composers/email-composer.registry.ts
import { Injectable } from '@nestjs/common';
import {
  EMAIL_JOB_NAMES,
  IEmailComposer,
  IEmailComposerRegistry,
} from '../interfaces/email.interfaces';
import { GenericComposer } from './generic.composer';
import { InvitationComposer } from './invitation.composer';
import { ReportComposer } from './report.composer';
import { TokenLinkComposer } from './token-link.composer';

/**
 * O(1) job-name → composer dispatch.
 *
 * REPLACES the strategy map the processor built inline, whose entries laundered
 * every payload through `(d as unknown as SendXJobData)` because the job union
 * was untagged. The union now carries a literal `type` discriminant, so each
 * composer declares the exact payload it handles and the casts are gone —
 * except the one below, which is structural and explained in place.
 *
 * OPEN/CLOSED: adding an email type means adding a payload to the union, a
 * composer class, and one line here. `EmailProcessor.process()` never changes.
 *
 * Built once in the constructor (this provider is a singleton) and exposed as a
 * `ReadonlyMap` so no caller can mutate the routing table at runtime.
 */
@Injectable()
export class EmailComposerRegistry implements IEmailComposerRegistry {
  private readonly composers: ReadonlyMap<string, IEmailComposer>;

  constructor(
    invitation: InvitationComposer,
    tokenLink: TokenLinkComposer,
    report: ReportComposer,
    generic: GenericComposer,
  ) {
    // Each composer is typed to its own payload member; the map is keyed by job
    // name and therefore erases to the union. The widening is safe because the
    // key and the payload's `type` discriminant are the same literal — the
    // processor looks a composer up BY the discriminant it is about to pass.
    this.composers = new Map<string, IEmailComposer>([
      [EMAIL_JOB_NAMES.SEND_INVITATION, invitation as IEmailComposer],
      [EMAIL_JOB_NAMES.SEND_TOKEN_LINK, tokenLink as IEmailComposer],
      [EMAIL_JOB_NAMES.SEND_REPORT, report as IEmailComposer],
      [EMAIL_JOB_NAMES.SEND_GENERIC, generic as IEmailComposer],
    ]);
  }

  resolve(jobName: string): IEmailComposer | undefined {
    return this.composers.get(jobName);
  }
}
