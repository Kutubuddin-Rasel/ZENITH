import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { RBACService } from './rbac.service';
import { RbacPermissionCheckerAdapter } from './adapters/rbac-permission-checker.adapter';
import { PERMISSION_CHECKER_TOKEN } from '../circuit-breaker/constants/circuit-breaker.tokens';

/**
 * RBAC Module
 *
 * Provides dynamic role-based access control. Global so `RBACService`
 * can be injected anywhere.
 *
 * DIP boundary: registers `RbacPermissionCheckerAdapter` against
 * `PERMISSION_CHECKER_TOKEN` so cross-cutting consumers (e.g. the
 * circuit-breaker engine) authorize through the abstract contract
 * instead of importing `RBACService` directly.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission])],
  providers: [
    RBACService,
    {
      provide: PERMISSION_CHECKER_TOKEN,
      useClass: RbacPermissionCheckerAdapter,
    },
  ],
  exports: [RBACService, TypeOrmModule, PERMISSION_CHECKER_TOKEN],
})
export class RBACModule {}
