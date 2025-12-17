import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';

interface JwtRequestUser {
    userId: string;
    isSuperAdmin: boolean;
}

/**
 * SuperAdminGuard
 * 
 * Restricts access to super admin users only.
 * Use with @UseGuards(SuperAdminGuard) decorator.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<{
            user: JwtRequestUser;
        }>();
        const user = request.user;

        if (!user || !user.isSuperAdmin) {
            throw new ForbiddenException('Only super admins can access this resource');
        }

        return true;
    }
}
