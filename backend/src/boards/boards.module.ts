// src/boards/boards.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Board } from './entities/board.entity';
import { BoardColumn } from './entities/board-column.entity';
import { BoardsService } from './boards.service';
import { BoardsController } from './boards.controller';
import { ProjectsModule } from '../projects/projects.module';
import { MembershipModule } from '../membership/membership.module';
import { BoardsGateway } from './boards.gateway';
import { WatchersModule } from '../watchers/watchers.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Board, BoardColumn]),
    forwardRef(() => ProjectsModule),
    MembershipModule,
    forwardRef(() => WatchersModule),
    UsersModule,
  ],
  providers: [BoardsService, BoardsGateway],
  controllers: [BoardsController],
  exports: [BoardsService],
})
export class BoardsModule {}
