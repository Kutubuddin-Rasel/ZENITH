import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { RBACService } from './rbac.service';

/**
 * RBAC Module
 *
 * Provides dynamic role-based access control.
 * Global module so RBACService can be injected anywhere.
 *
 * Entities:
 * - Role: Roles assignable to project members
 * - Permission: Granular resource:action permissions
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission])],
  providers: [RBACService],
  exports: [RBACService, TypeOrmModule],
})
export class RBACModule {}
