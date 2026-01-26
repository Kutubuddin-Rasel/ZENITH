import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AccessControlService } from './access-control.service';
import { AccessControlController } from './access-control.controller';
import { AccessControlGuard } from './guards/access-control.guard';
import { IpResolutionService } from './services/ip-resolution.service';
import { IPAccessRule } from './entities/ip-access-rule.entity';
import { AccessRuleHistory } from './entities/access-rule-history.entity';
import { User } from '../users/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { MembershipModule } from '../membership/membership.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([IPAccessRule, AccessRuleHistory, User]),
    ConfigModule,
    AuditModule,
    MembershipModule,
    CacheModule,
    EventEmitterModule.forRoot(), // For cache invalidation events
  ],
  providers: [AccessControlService, AccessControlGuard, IpResolutionService],
  controllers: [AccessControlController],
  exports: [AccessControlService, AccessControlGuard, IpResolutionService],
})
export class AccessControlModule {}
