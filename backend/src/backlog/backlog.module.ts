// src/backlog/backlog.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IssuesModule } from '../issues/issues.module';
import { MembershipModule } from '../membership/membership.module';
import { BacklogService } from './backlog.service';
import { BacklogController } from './backlog.controller';
import { Issue } from '../issues/entities/issue.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Issue]),
    forwardRef(() => IssuesModule),
    forwardRef(() => MembershipModule),
  ],
  providers: [BacklogService],
  controllers: [BacklogController],
})
export class BacklogModule {}
