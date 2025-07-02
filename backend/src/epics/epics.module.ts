// src/epics/epics.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Epic } from './entities/epic.entity';
import { Story } from './entities/story.entity';
import { EpicsService } from './epics.service';
import { EpicsController } from './epics.controller';
import { ProjectsModule } from '../projects/projects.module';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Epic, Story]),
    forwardRef(() => ProjectsModule),
    MembershipModule,
  ],
  providers: [EpicsService],
  controllers: [EpicsController],
  exports: [EpicsService],
})
export class EpicsModule {}
