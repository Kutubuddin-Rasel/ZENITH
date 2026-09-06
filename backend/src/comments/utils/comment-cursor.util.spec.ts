// src/comments/utils/comment-cursor.util.spec.ts
import { encodeCursor, decodeCursor } from './comment-cursor.util';

describe('comment-cursor.util', () => {
  it('round-trips a cursor', () => {
    const createdAt = new Date('2026-06-04T10:00:00.000Z');
    const id = 'abc-123';
    const token = encodeCursor({ createdAt, id });
    expect(decodeCursor(token)).toEqual({ createdAt, id });
  });

  it('returns undefined for a malformed cursor', () => {
    expect(decodeCursor('not-base64!@#')).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(decodeCursor(undefined)).toBeUndefined();
  });
});
