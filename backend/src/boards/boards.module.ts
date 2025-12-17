// src/boards/boards.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Board } from './entities/board.entity';
import { BoardColumn } from './entities/board-column.entity';
import { Issue } from '../issues/entities/issue.entity';
import { BoardsService } from './boards.service';
import { BoardsController } from './boards.controller';
// REMOVED: ProjectsModule - using CoreEntitiesModule (global) for Project repository
// REMOVED: MembershipModule - using ProjectCoreModule (global) for ProjectMembersService
import { BoardsGateway } from './boards.gateway';
// REMOVED: WatchersModule - no longer needed, BoardsService uses events
// REMOVED: UsersModule - using UsersCoreModule (global)

@Module({
  imports: [
    TypeOrmModule.forFeature([Board, BoardColumn, Issue]),
    // REFACTORED: All forwardRefs eliminated - using global core modules
  ],
  providers: [BoardsService, BoardsGateway],
  controllers: [BoardsController],
  exports: [BoardsService],
})
export class BoardsModule { }
