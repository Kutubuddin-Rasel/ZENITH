import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invite } from './entities/invite.entity';
import { InvitesService } from './invites.service';
import {
  InvitesController,
  ProjectInvitesController,
} from './invites.controller';
import { AuthModule } from '../auth/auth.module';
import { MembershipModule } from '../membership/membership.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invite]),
    forwardRef(() => AuthModule), // wrap in forwardRef
    // so JwtAuthGuard & PermissionsGuard are available
    forwardRef(() => MembershipModule), // so PermissionsGuard can inject ProjectMembersService
    UsersModule, // if InvitesService uses UsersService
    NotificationsModule,
    forwardRef(() => ProjectsModule),
  ],
  providers: [InvitesService],
  controllers: [InvitesController, ProjectInvitesController],
  exports: [InvitesService], // so AuthService or other modules can use it
})
export class InvitesModule {}
