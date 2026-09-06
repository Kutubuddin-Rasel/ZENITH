// src/email/utils/job-id.util.ts
import { createHash, randomBytes } from 'crypto';
import { EmailJobData } from '../interfaces/email.interfaces';

/** Hash prefix length. 32 hex chars = 128 bits — collision-free at our volume. */
const JOB_ID_LENGTH = 32;

/**
 * Builds a deterministic BullMQ `jobId` so the same logical email enqueued
 * twice collapses into ONE job.
 *
 * WHY THIS MATTERS NOW: Step 2 wired three domain-event listeners
 * (invitation, email-verification, 2FA-recovery). EventEmitter2 delivery plus
 * caller retries mean "the same email, twice" went from impossible to routine.
 * BullMQ rejects an `add()` whose `jobId` is already resident, giving O(1)
 * dedup inside the `removeOnComplete: 100` retention window — no new infra.
 *
 * The digest inputs decide the semantics: fields included here distinguish two
 * emails, fields omitted collapse them.
 */
export function buildEmailJobId(data: EmailJobData): string {
  const fields = identityFields(data);

  // SAFE DEFAULT while the branches below are unimplemented: with no identity
  // fields, hashing only (type + recipient) would collapse EVERY email of that
  // type to that address into one job — a user invited to two orgs would get a
  // single invite. Falling back to a random nonce means "no dedup", which is
  // exactly today's behaviour: no change, no risk. Dedup switches on as soon
  // as the branches return real values.
  const fingerprint =
    fields.length > 0 ? fields.join('|') : randomBytes(16).toString('hex');

  return createHash('sha256')
    .update(`${data.type}|${data.to.toLowerCase().trim()}|${fingerprint}`)
    .digest('hex')
    .slice(0, JOB_ID_LENGTH);
}

/**
 * Returns the payload fields that make one email DISTINCT from another.
 *
 * `type` and `to` are already folded into the hash by the caller, so this
 * covers only the per-type remainder.
 *
 * TODO(you): implement the four branches. See the guidance in the chat message
 * — the trade-off is real in both directions:
 *
 *   - Include too little → two genuinely different emails to the same person
 *     collapse into one, and the second is silently dropped. (A user invited to
 *     two orgs in the same hour gets one invite.)
 *   - Include too much → nothing ever matches, and the dedup does nothing. Any
 *     field that varies per call (a fresh token, a timestamp, a presigned URL)
 *     defeats it entirely.
 *
 * Return the values as strings, in a stable order.
 */
function identityFields(data: EmailJobData): string[] {
  switch (data.type) {
    case 'send-invitation':
      // TODO: what makes two invitations to the same address different?
      return [];

    case 'send-token-link':
      // TODO: note that `link` embeds a freshly-minted token on every call.
      return [];

    case 'send-report':
      // TODO: the s3ObjectKey already encodes org/project/date/format.
      return [];

    case 'send-generic':
      // TODO: this one is caller-supplied and opaque to us.
      return [];
  }
}
