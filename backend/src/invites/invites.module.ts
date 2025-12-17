import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invite } from './entities/invite.entity';
import { InvitesService } from './invites.service';
import {
  InvitesController,
  ProjectInvitesController,
} from './invites.controller';
// REMOVED: AuthModule import - guards are global via APP_GUARD
// REMOVED: MembershipModule import - using ProjectCoreModule (global)
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invite]),
    // REFACTORED: Removed forwardRef(() => AuthModule) - guards are global
    // REFACTORED: Removed forwardRef(() => MembershipModule) - ProjectCoreModule is global
    UsersModule,
    NotificationsModule,
    // FIX: InvitesService needs ProjectsService
    forwardRef(() => ProjectsModule),
  ],
  providers: [InvitesService],
  controllers: [InvitesController, ProjectInvitesController],
  exports: [InvitesService],
})
export class InvitesModule { }
