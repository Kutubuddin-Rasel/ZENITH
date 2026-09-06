// src/gateways/interfaces/gateways.interfaces.ts
import { Socket } from 'socket.io';

// ============================================================================
// GATEWAYS MODULE — ISP CONTRACTS
//
// Level 3 (transport). Nothing in this file may reference a TypeORM entity, a
// repository, or a domain service. The gateway's job is: authenticate the
// handshake, gate room membership, fan events out. Everything else is a port.
// ============================================================================

/**
 * Verified identity attached to `client.data.user` after the handshake.
 *
 * SECURITY: every field is derived from a signature-verified JWT. Nothing here
 * is ever read from client-supplied message bodies — that is the whole point of
 * authenticating at connection time rather than per message.
 */
export interface SocketUser {
  id: string;
  email: string;
  roles: string[];
}

/**
 * Socket with a verified user attached.
 *
 * PROHIBITION: do not use `any` for socket clients. A handler that receives a
 * bare `Socket` has no proof the handshake succeeded; this type is that proof.
 */
export interface AuthenticatedSocket extends Socket {
  data: {
    user: SocketUser;
  };
}

/**
 * Structured error payload emitted to WebSocket clients.
 *
 * Consistent shape lets the frontend handle all WS errors uniformly:
 *   socket.on('exception', (error: WsErrorResponse) => { ... });
 */
export interface WsErrorResponse {
  /** Always 'error' for error events */
  status: 'error';

  /** Human-readable, security-safe error message */
  message: string;

  /** ISO timestamp for client-side correlation */
  timestamp: string;
}

/**
 * Handshake + refresh JWT verification.
 *
 * Extracted from the two near-identical blocks that lived inside the gateway
 * (`handleConnection` and `handleTokenRefresh` each re-implemented: read
 * secret → verify → validate claims → build user → categorise failure). One
 * implementation, and — for the first time — a testable one.
 */
export interface IWsAuthenticator {
  /**
   * Verify a raw JWT and project it onto the socket identity shape.
   *
   * @throws WsAuthError with a machine-readable `reason` on any failure. The
   *   caller decides whether that means "reject the connection" or "reject the
   *   refresh"; the authenticator never touches the socket.
   */
  verify(token: string): Promise<SocketUser>;

  /**
   * Pull the bearer token off a handshake.
   *
   * Accepts `handshake.auth.token` (the socket.io idiom) and the
   * `Authorization` header. Deliberately does NOT accept query parameters —
   * query strings are recorded verbatim by proxies, load balancers and access
   * logs, so a token placed there leaks into infrastructure we do not control.
   */
  extractToken(client: Socket): string | undefined;
}

/**
 * Room subscriptions that survive a socket's lifetime.
 *
 * Per-USER, not per-socket: socket ids change on every reconnect, so a
 * socket-keyed store would forget everything precisely when it is needed.
 */
export interface IWsSessionStore {
  /**
   * Replace the user's stored room set with `rooms` and refresh the grace TTL.
   *
   * Whole-set replacement rather than incremental add/remove is deliberate —
   * see the race note on the implementation. Callers pass socket.io's own
   * authoritative room set, which cannot be stale or partially applied.
   */
  syncRooms(userId: string, rooms: readonly string[]): Promise<void>;

  /** Rooms the user held when last seen. Empty when Redis is unavailable. */
  getRooms(userId: string): Promise<string[]>;

  /** Forget every room (explicit logout / session revocation). */
  clearRooms(userId: string): Promise<void>;
}

/** Machine-readable JWT failure categories. Never carries the token itself. */
export type WsAuthFailureReason =
  | 'NoTokenProvided'
  | 'JwtSecretNotConfigured'
  | 'InvalidPayloadStructure'
  | 'TokenExpired'
  | 'InvalidSignature'
  | 'MalformedToken'
  | 'InvalidToken'
  | 'JwtVerificationFailed'
  | 'UnknownError';

/**
 * Auth failure carrying a category instead of a provider message.
 *
 * SECURITY: `reason` is safe to log; the underlying jsonwebtoken message is
 * not (it can echo token fragments). The gateway logs `reason` and emits a
 * generic string to the client.
 */
export class WsAuthError extends Error {
  constructor(readonly reason: WsAuthFailureReason) {
    super(reason);
    this.name = 'WsAuthError';
  }
}
