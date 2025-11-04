import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { SessionInterceptor } from './interceptors/session.interceptor';
import { Session } from './entities/session.entity';
import { User } from '../users/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, User]),
    ConfigModule,
    AuditModule,
    MembershipModule,
  ],
  providers: [SessionService, SessionInterceptor],
  controllers: [SessionController],
  exports: [SessionService, SessionInterceptor],
})
export class SessionModule {}
