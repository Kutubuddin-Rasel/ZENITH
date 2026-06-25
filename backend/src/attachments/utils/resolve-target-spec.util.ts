import { BadRequestException } from '@nestjs/common';
import type {
  AttachmentTarget,
  AttachmentTargetSpec,
} from '../interfaces/attachments.interfaces';

/**
 * Pure O(1) target dispatch.
 *
 * Replaces the legacy 5×3 method explosion (`createForProject` /
 * `findAllForIssue` / `removeForSprint` …) — fifteen near-identical methods,
 * each repeating parent-guard → build → query/find → uploader-or-lead check —
 * with a single registry lookup. An unregistered target yields a 400 rather
 * than a silent `undefined` fallthrough or an uncovered seq-scan path.
 */
export function resolveTargetSpec(
  registry: ReadonlyMap<AttachmentTarget, AttachmentTargetSpec>,
  target: string,
): AttachmentTargetSpec {
  const spec = registry.get(target as AttachmentTarget);
  if (!spec) {
    throw new BadRequestException(`Unsupported attachment target: ${target}`);
  }
  return spec;
}
