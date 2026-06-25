import { BadRequestException } from '@nestjs/common';
import { resolveTargetSpec } from './resolve-target-spec.util';
import type {
  AttachmentTarget,
  AttachmentTargetSpec,
} from '../interfaces/attachments.interfaces';

describe('resolveTargetSpec', () => {
  const issueSpec: AttachmentTargetSpec = {
    column: 'issueId',
    assertParent: jest.fn().mockResolvedValue(undefined),
  };
  const commentSpec: AttachmentTargetSpec = {
    column: 'commentId',
    assertParent: jest.fn().mockResolvedValue(undefined),
  };

  const registry: ReadonlyMap<AttachmentTarget, AttachmentTargetSpec> = new Map<
    AttachmentTarget,
    AttachmentTargetSpec
  >([
    ['issue', issueSpec],
    ['comment', commentSpec],
  ]);

  it('returns the registered spec (column + guard) for a known target', () => {
    expect(resolveTargetSpec(registry, 'issue')).toBe(issueSpec);
    expect(resolveTargetSpec(registry, 'comment').column).toBe('commentId');
  });

  it('throws BadRequestException for an unregistered target (no silent fallthrough)', () => {
    expect(() => resolveTargetSpec(registry, 'epic')).toThrow(
      BadRequestException,
    );
  });
});
