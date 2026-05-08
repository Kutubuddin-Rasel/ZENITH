import { Module, Global, Provider } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Board } from '../boards/entities/board.entity';
import { Issue } from '../issues/entities/issue.entity';
import { WorkLog } from '../issues/entities/work-log.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';

import { BoardRepository } from './repositories/board.repository';
import { IssueRepository } from './repositories/issue.repository';
import { ProjectRepository } from './repositories/project.repository';
import { UserRepository } from './repositories/user.repository';
import { WorkLogRepository } from './repositories/work-log.repository';

import { TypeOrmBoardRepository } from './repositories/typeorm/typeorm-board.repository';
import { TypeOrmIssueRepository } from './repositories/typeorm/typeorm-issue.repository';
import { TypeOrmProjectRepository } from './repositories/typeorm/typeorm-project.repository';
import { TypeOrmUserRepository } from './repositories/typeorm/typeorm-user.repository';
import { TypeOrmWorkLogRepository } from './repositories/typeorm/typeorm-work-log.repository';

import { QueryOptimizerService } from './services/query-optimizer.service';

/**
 * DIP wiring: every Tier-1 aggregate exposes an abstract class as the
 * injection token; concrete `TypeOrm*Repository` implementations are bound via
 * `useClass`. Consumers depend ONLY on the abstract tokens — the concrete
 * classes are intentionally NOT exported.
 */
const REPOSITORY_PROVIDERS: Provider[] = [
  { provide: BoardRepository, useClass: TypeOrmBoardRepository },
  { provide: IssueRepository, useClass: TypeOrmIssueRepository },
  { provide: ProjectRepository, useClass: TypeOrmProjectRepository },
  { provide: UserRepository, useClass: TypeOrmUserRepository },
  { provide: WorkLogRepository, useClass: TypeOrmWorkLogRepository },
];

@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Board, Issue, Project, User, WorkLog]),
  ],
  providers: [QueryOptimizerService, ...REPOSITORY_PROVIDERS],
  exports: [
    QueryOptimizerService,
    BoardRepository,
    IssueRepository,
    ProjectRepository,
    UserRepository,
    WorkLogRepository,
  ],
})
export class DatabaseModule {}
