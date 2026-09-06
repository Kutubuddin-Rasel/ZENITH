import { EMAIL_JOB_NAMES } from '../interfaces/email.interfaces';
import { EmailComposerRegistry } from './email-composer.registry';
import { GenericComposer } from './generic.composer';
import { InvitationComposer } from './invitation.composer';
import { ReportComposer } from './report.composer';
import { TokenLinkComposer } from './token-link.composer';

/**
 * The registry is pure routing — it needs no Nest context, only four distinct
 * object identities to prove each job name lands on the right composer.
 */
describe('EmailComposerRegistry', () => {
  const invitation = { compose: jest.fn() } as unknown as InvitationComposer;
  const tokenLink = { compose: jest.fn() } as unknown as TokenLinkComposer;
  const report = { compose: jest.fn() } as unknown as ReportComposer;
  const generic = { compose: jest.fn() } as unknown as GenericComposer;

  const registry = new EmailComposerRegistry(
    invitation,
    tokenLink,
    report,
    generic,
  );

  it.each([
    [EMAIL_JOB_NAMES.SEND_INVITATION, invitation],
    [EMAIL_JOB_NAMES.SEND_TOKEN_LINK, tokenLink],
    [EMAIL_JOB_NAMES.SEND_REPORT, report],
    [EMAIL_JOB_NAMES.SEND_GENERIC, generic],
  ])('routes %s to its composer', (jobName, expected) => {
    expect(registry.resolve(jobName)).toBe(expected);
  });

  it('returns undefined for an unknown job name', () => {
    // The processor logs and drops on undefined rather than throwing — a
    // retry would resolve identically, so retrying would only add noise.
    expect(registry.resolve('send-carrier-pigeon')).toBeUndefined();
  });

  it('returns undefined for the job name retired in this refactor', () => {
    // `send-password-reset` was folded into `send-token-link`. Nothing ever
    // produced it (zero callers), so no in-flight job can exist — but if one
    // somehow did, it must miss rather than mis-route.
    expect(registry.resolve('send-password-reset')).toBeUndefined();
  });

  it('covers every job name in the union', () => {
    // Guards the Open/Closed contract: adding a job name without registering a
    // composer fails here rather than at 3am in the worker.
    for (const jobName of Object.values(EMAIL_JOB_NAMES)) {
      expect(registry.resolve(jobName)).toBeDefined();
    }
  });
});
