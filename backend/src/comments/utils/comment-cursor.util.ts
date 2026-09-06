// src/comments/utils/comment-cursor.util.ts
import type { KeysetCursor } from '../interfaces/comments.interfaces';

/** Opaque cursor = base64url("<ISO createdAt>|<id>"). */
export function encodeCursor(c: KeysetCursor): string {
  return Buffer.from(`${c.createdAt.toISOString()}|${c.id}`, 'utf8').toString(
    'base64url',
  );
}

export function decodeCursor(
  token: string | undefined,
): KeysetCursor | undefined {
  if (!token) return undefined;
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const sep = raw.indexOf('|');
    if (sep < 0) return undefined;
    const createdAt = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (Number.isNaN(createdAt.getTime()) || !id) return undefined;
    return { createdAt, id };
  } catch {
    return undefined;
  }
}
