import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public() decorator
 * Mark a route as public, bypassing JWT authentication.
 * Used with JwtAuthGuard which checks for this metadata.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
