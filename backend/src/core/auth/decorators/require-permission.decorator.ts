import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION = 'require_permission';

/**
 * @RequirePermission('some:action')
 * Attaches metadata so PermissionsGuard can read which permission is required.
 */
export const RequirePermission = (permission: string) =>
    SetMetadata(REQUIRE_PERMISSION, permission);
