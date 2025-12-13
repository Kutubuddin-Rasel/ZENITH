// src/revisions/revisions.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Revision } from './entities/revision.entity';
import { RevisionSubscriber } from './subscribers/revision.subscriber';
import { UserIdInterceptor } from './interceptors/user-id.interceptor';
import { RevisionsService } from './revisions.service';
import { RevisionsController } from './revisions.controller';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [TypeOrmModule.forFeature([Revision]), MembershipModule],
  providers: [
    RevisionSubscriber,
    RevisionsService,
    { provide: APP_INTERCEPTOR, useClass: UserIdInterceptor },
  ],
  controllers: [RevisionsController],
  exports: [RevisionsService],
})
export class RevisionsModule { }
