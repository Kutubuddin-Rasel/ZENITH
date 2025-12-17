import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

// Guards
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { ProjectRoleGuard } from './guards/project-role.guard';
import { SuperAdminGuard } from './guards/super-admin.guard';

// Dependencies
import { CacheModule } from '../../cache/cache.module';

/**
 * AuthCoreModule
 * 
 * Provides authentication guards globally via APP_GUARD pattern.
 * This module should be imported early in app.module.ts.
 * 
 * Guards are applied in order:
 * 1. JwtAuthGuard - Authenticates the request (checks JWT cookie)
 * 2. PermissionsGuard - Checks action-based permissions
 * 
 * Note: ProjectRoleGuard and SuperAdminGuard are used via decorators,
 * not as global guards.
 */
@Global()
@Module({
    imports: [
        CacheModule, // Required for PermissionsGuard and ProjectRoleGuard
    ],
    providers: [
        // Make guards available for injection
        JwtAuthGuard,
        PermissionsGuard,
        ProjectRoleGuard,
        SuperAdminGuard,
        // Register JwtAuthGuard as global guard
        {
            provide: APP_GUARD,
            useClass: JwtAuthGuard,
        },
        // Register PermissionsGuard as global guard (runs after JwtAuthGuard)
        {
            provide: APP_GUARD,
            useClass: PermissionsGuard,
        },
    ],
    exports: [
        JwtAuthGuard,
        PermissionsGuard,
        ProjectRoleGuard,
        SuperAdminGuard,
    ],
})
export class AuthCoreModule { }
