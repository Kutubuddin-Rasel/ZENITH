// src/gateways/constants/gateways.tokens.ts

/**
 * Gateways Module — DI Tokens
 *
 * Mirrors `notifications/constants/notifications.tokens.ts`. Symbol tokens so
 * two modules cannot collide on a string, and so a consumer that skips the
 * barrel gets a compile error rather than a silently-undefined injection.
 *
 * DELIBERATELY ABSENT: a token for `BoardGateway`. After the port inversion it
 * has zero consumers outside this module — `boards` reaches realtime through
 * the boards-owned `BoardRealtimePort`, `issues` through `IssueBroadcastPort`.
 * Publishing an address for a class nobody may inject would be scaffolding.
 */

/** Redis-backed room-subscription store → `IWsSessionStore`. */
export const WS_SESSION_STORE_TOKEN = Symbol('WS_SESSION_STORE_TOKEN');

/** Handshake + refresh JWT verification → `IWsAuthenticator`. */
export const WS_AUTHENTICATOR_TOKEN = Symbol('WS_AUTHENTICATOR_TOKEN');

export type WsSessionStoreToken = typeof WS_SESSION_STORE_TOKEN;
export type WsAuthenticatorToken = typeof WS_AUTHENTICATOR_TOKEN;
