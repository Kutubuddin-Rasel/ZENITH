// src/gateways/services/ws-authenticator.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import {
  IWsAuthenticator,
  SocketUser,
  WsAuthError,
  WsAuthFailureReason,
} from '../interfaces/gateways.interfaces';

/**
 * JWT payload as it arrives off the wire.
 *
 * Deliberately module-private: it is a transport detail. The rest of the
 * module only ever sees `SocketUser`, so a claim rename cannot ripple past
 * this file.
 */
interface JwtPayload {
  sub: string;
  email: string;
  roles?: string[];
  iat?: number;
  exp?: number;
}

/**
 * WsAuthenticator
 *
 * The gateway used to carry two near-identical copies of this logic — one in
 * `handleConnection`, one in `handleTokenRefresh` — each reading the secret,
 * calling `verifyAsync`, checking `sub`/`email`, building the user object, and
 * categorising the failure. Two copies of a security check is one copy too
 * many: they drift, and only one of them gets fixed.
 *
 * Consolidating also makes JWT verification unit-testable for the first time.
 * The whole module previously had zero specs despite owning handshake auth,
 * session-hijack detection and IDOR prevention.
 *
 * This class never touches the socket. It answers "is this token good, and who
 * does it belong to" and throws `WsAuthError` otherwise; whether that means
 * "reject the connection" or "reject the refresh" is the caller's decision.
 */
@Injectable()
export class WsAuthenticator implements IWsAuthenticator {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async verify(token: string): Promise<SocketUser> {
    if (!token) {
      throw new WsAuthError('NoTokenProvided');
    }

    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      // Config error, not a client error. Distinct reason so it is greppable
      // in logs — this one means "page someone", not "someone probed us".
      throw new WsAuthError('JwtSecretNotConfigured');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
      });
    } catch (err: unknown) {
      throw new WsAuthError(categorizeJwtError(err));
    }

    if (!payload.sub || !payload.email) {
      throw new WsAuthError('InvalidPayloadStructure');
    }

    return {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles ?? [],
    };
  }

  /**
   * Extract the bearer token from a handshake.
   * Priority: `auth.token` (the socket.io idiom) → `Authorization` header.
   *
   * SECURITY: query parameters are NOT accepted. The deleted `WsJwtGuard` did
   * accept them (`handshake.query.token`), which meant a valid JWT could end
   * up written verbatim into proxy access logs, load-balancer logs and browser
   * history. Handshake auth and headers do not have that property.
   */
  extractToken(client: Socket): string | undefined {
    const authToken: unknown = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const authHeader = client.handshake.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.length > 0) {
      const trimmed = authHeader.trim();
      if (trimmed.toLowerCase().startsWith('bearer ')) {
        return trimmed.slice(7).trim();
      }
      // No Bearer prefix — assume a raw token (preserved from the original
      // gateway behaviour; some clients send it bare).
      return trimmed;
    }

    return undefined;
  }
}

/**
 * Categorise a JWT failure for structured logging.
 *
 * SECURITY: the provider's message can echo fragments of the offending token,
 * so it is inspected here and then dropped. Only the category escapes.
 *
 * Exported for direct unit testing — it is the security-relevant half and
 * deserves its own assertions without standing up a Nest module.
 */
export function categorizeJwtError(err: unknown): WsAuthFailureReason {
  if (!(err instanceof Error)) {
    return 'UnknownError';
  }

  const message = err.message.toLowerCase();

  if (message.includes('expired')) {
    return 'TokenExpired';
  }
  if (message.includes('invalid signature') || message.includes('signature')) {
    return 'InvalidSignature';
  }
  if (message.includes('malformed') || message.includes('jwt malformed')) {
    return 'MalformedToken';
  }
  if (message.includes('invalid token')) {
    return 'InvalidToken';
  }

  return 'JwtVerificationFailed';
}
