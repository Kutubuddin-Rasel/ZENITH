import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Board } from '../boards/entities/board.entity';
import { BoardColumn } from '../boards/entities/board-column.entity';
import { Issue } from '../issues/entities/issue.entity';
import { IssueLink } from '../issues/entities/issue-link.entity';
import { WorkLog } from '../issues/entities/work-log.entity';
import { ProjectAccessSettings } from '../projects/entities/project-access-settings.entity';
import { ProjectSecurityPolicy } from '../projects/entities/project-security-policy.entity';
import { Project } from '../projects/entities/project.entity';
import { Revision } from '../revisions/entities/revision.entity';
import { User } from '../users/entities/user.entity';

import { createDatabaseConfig } from './config/database.config';

import { BoardRepository } from './repositories/board.repository';
import { BoardColumnRepository } from './repositories/board-column.repository';
import { IssueRepository } from './repositories/issue.repository';
import { IssueLinkRepository } from './repositories/issue-link.repository';
import { ProjectAccessSettingsRepository } from './repositories/project-access-settings.repository';
import { ProjectSecurityPolicyRepository } from './repositories/project-security-policy.repository';
import { ProjectRepository } from './repositories/project.repository';
import { RevisionRepository } from './repositories/revision.repository';
import { UserRepository } from './repositories/user.repository';
import { WorkLogRepository } from './repositories/work-log.repository';

import { TypeOrmBoardRepository } from './repositories/typeorm/typeorm-board.repository';
import { TypeOrmBoardColumnRepository } from './repositories/typeorm/typeorm-board-column.repository';
import { TypeOrmIssueRepository } from './repositories/typeorm/typeorm-issue.repository';
import { TypeOrmIssueLinkRepository } from './repositories/typeorm/typeorm-issue-link.repository';
import { TypeOrmProjectAccessSettingsRepository } from './repositories/typeorm/typeorm-project-access-settings.repository';
import { TypeOrmProjectSecurityPolicyRepository } from './repositories/typeorm/typeorm-project-security-policy.repository';
import { TypeOrmProjectRepository } from './repositories/typeorm/typeorm-project.repository';
import { TypeOrmRevisionRepository } from './repositories/typeorm/typeorm-revision.repository';
import { TypeOrmUserRepository } from './repositories/typeorm/typeorm-user.repository';
import { TypeOrmWorkLogRepository } from './repositories/typeorm/typeorm-work-log.repository';

import { PaginationService } from './services/pagination.service';
import { QueryAnalyzerService } from './services/query-analyzer.service';
import { QueryCacheService } from './services/query-cache.service';
import { QueryOptimizerService } from './services/query-optimizer.service';

import { CacheModule } from '../cache/cache.module';
/**
 * DIP wiring: every Tier-1 aggregate exposes an abstract class as the
 * injection token; concrete `TypeOrm*Repository` implementations are bound via
 * `useClass`. Consumers depend ONLY on the abstract tokens — the concrete
 * classes are intentionally NOT exported.
 */
const REPOSITORY_PROVIDERS: Provider[] = [
  { provide: BoardRepository, useClass: TypeOrmBoardRepository },
  { provide: BoardColumnRepository, useClass: TypeOrmBoardColumnRepository },
  { provide: IssueRepository, useClass: TypeOrmIssueRepository },
  { provide: IssueLinkRepository, useClass: TypeOrmIssueLinkRepository },
  { provide: ProjectRepository, useClass: TypeOrmProjectRepository },
  {
    provide: ProjectAccessSettingsRepository,
    useClass: TypeOrmProjectAccessSettingsRepository,
  },
  {
    provide: ProjectSecurityPolicyRepository,
    useClass: TypeOrmProjectSecurityPolicyRepository,
  },
  { provide: RevisionRepository, useClass: TypeOrmRevisionRepository },
  { provide: UserRepository, useClass: TypeOrmUserRepository },
  { provide: WorkLogRepository, useClass: TypeOrmWorkLogRepository },
];

const SERVICE_PROVIDERS: Provider[] = [
  QueryCacheService,
  PaginationService,
  QueryAnalyzerService,
  QueryOptimizerService,
];

const EXPORTED_TOKENS = [
  QueryCacheService,
  PaginationService,
  QueryAnalyzerService,
  QueryOptimizerService,
  BoardRepository,
  BoardColumnRepository,
  IssueRepository,
  IssueLinkRepository,
  ProjectRepository,
  ProjectAccessSettingsRepository,
  ProjectSecurityPolicyRepository,
  RevisionRepository,
  UserRepository,
  WorkLogRepository,
];

/**
 * DatabaseModule — sole owner of TypeORM bootstrap, abstract repository
 * tokens, and query-optimization services.
 *
 * Use `DatabaseModule.forRoot()` exactly once at the application root to
 * register the underlying `TypeOrmModule.forRootAsync` connection. The
 * resulting module is `@Global`, so feature modules never need to re-import
 * it — they receive the abstract repositories directly.
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      Board,
      BoardColumn,
      Issue,
      IssueLink,
      Project,
      ProjectAccessSettings,
      ProjectSecurityPolicy,
      Revision,
      User,
      WorkLog,
    ]),
    CacheModule,
  ],
  providers: [...SERVICE_PROVIDERS, ...REPOSITORY_PROVIDERS],
  exports: EXPORTED_TOKENS,
})
export class DatabaseModule {
  /**
   * Encapsulates the TypeORM connection bootstrap behind a single static
   * factory. The application root simply imports `DatabaseModule.forRoot()`;
   * the underlying `TypeOrmModule.forRootAsync` becomes an implementation
   * detail of this module.
   */
  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      imports: [
        ConfigModule,
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: createDatabaseConfig,
        }),
        TypeOrmModule.forFeature([
          Board,
          BoardColumn,
          Issue,
          IssueLink,
          Project,
          ProjectAccessSettings,
          ProjectSecurityPolicy,
          Revision,
          User,
          WorkLog,
        ]),
      ],
      providers: [...SERVICE_PROVIDERS, ...REPOSITORY_PROVIDERS],
      exports: EXPORTED_TOKENS,
    };
  }
}
