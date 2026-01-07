import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfService } from './csrf.service';

export const REQUIRE_CSRF_KEY = 'require_csrf';
export const RequireCsrf = () => SetMetadata(REQUIRE_CSRF_KEY, true);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly csrfService: CsrfService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requireCsrf = this.reflector.get<boolean>(
      REQUIRE_CSRF_KEY,
      context.getHandler(),
    );

    if (!requireCsrf) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    const csrfToken = request.headers['x-csrf-token'] as string;

    if (!userId) {
      throw new ForbiddenException(
        'Authentication required for CSRF validation',
      );
    }

    const isValid = await this.csrfService.validateToken(userId, csrfToken);

    if (!isValid) {
      throw new ForbiddenException('Invalid or expired CSRF token');
    }

    return true;
  }
}
