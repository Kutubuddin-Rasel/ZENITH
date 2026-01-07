import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { CookieService } from '../services/cookie.service';

/**
 * CSRF Guard - Protects against Cross-Site Request Forgery
 *
 * Required for any endpoint that:
 * 1. Uses cookie-based authentication (refresh token)
 * 2. Performs state-changing operations
 *
 * How it works:
 * 1. Login sets a CSRF token in a readable (non-HttpOnly) cookie
 * 2. Frontend reads this cookie and sends it as X-CSRF-Token header
 * 3. This guard compares the header value to the cookie value
 * 4. Match = legitimate request, Mismatch = potential CSRF attack
 *
 * Why this works:
 * - Same-Origin Policy prevents malicious sites from reading our cookies
 * - So a CSRF attacker cannot read the token to put in the header
 * - The cookie is sent automatically, but the header is not
 */
@Injectable()
export class CsrfGuard implements CanActivate {
    constructor(private readonly cookieService: CookieService) { }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();

        // Validate CSRF token (header must match cookie)
        const isValid = this.cookieService.validateCsrfToken(request);

        if (!isValid) {
            throw new ForbiddenException(
                'CSRF token validation failed. Please refresh and try again.',
            );
        }

        return true;
    }
}
