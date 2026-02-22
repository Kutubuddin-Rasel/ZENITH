import { IsJWT } from 'class-validator';

/**
 * DTO for WebSocket token refresh payload.
 *
 * Validates that the incoming token is a well-formed JWT string.
 * Used by the `auth:refresh` handler to accept a rotated access token.
 *
 * STRICT TYPING: No `any` types. Token is validated at the DTO
 * layer before reaching the handler logic.
 */
export class WsTokenRefreshDto {
  @IsJWT({ message: 'token must be a valid JWT string' })
  token: string;
}
