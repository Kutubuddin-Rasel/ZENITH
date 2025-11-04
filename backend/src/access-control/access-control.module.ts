import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AccessControlService } from './access-control.service';
import { AccessControlController } from './access-control.controller';
import { AccessControlGuard } from './guards/access-control.guard';
import { IPAccessRule } from './entities/ip-access-rule.entity';
import { User } from '../users/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IPAccessRule, User]),
    ConfigModule,
    AuditModule,
    MembershipModule,
  ],
  providers: [AccessControlService, AccessControlGuard],
  controllers: [AccessControlController],
  exports: [AccessControlService, AccessControlGuard],
})
export class AccessControlModule {}
