import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ProjectMember } from './entities/project-member.entity';
import { ProjectMembersService } from './project-members/project-members.service';
import { ProjectMembersController } from './project-members/project-members.controller';
import { AuditLogsModule } from '../audit/audit-logs.module';
import { CsrfModule } from '../security/csrf/csrf.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectMember]),
    EventEmitterModule.forRoot(), // EventEmitter2 DI
    AuditLogsModule, // AuditLogsService DI
    CsrfModule, // CsrfGuard DI for @RequireCsrf()
  ],
  providers: [ProjectMembersService],
  controllers: [ProjectMembersController],
  exports: [ProjectMembersService], // Used by AuthService, PermissionsGuard, etc.
})
export class MembershipModule {}
