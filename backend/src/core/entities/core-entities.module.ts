import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Shared entities that are used across multiple modules
import { User } from '../../users/entities/user.entity';
import { Project } from '../../projects/entities/project.entity';
import { Issue } from '../../issues/entities/issue.entity';

/**
 * CoreEntitiesModule
 *
 * Provides shared TypeORM repositories for entities that are commonly
 * needed across multiple modules. This eliminates the need for each
 * module to import TypeOrmModule.forFeature() for shared entities.
 *
 * Being @Global means any module can inject these repositories without
 * explicitly importing this module.
 *
 * Aggregate boundaries
 * --------------------
 * `ProjectMember` was removed from this global registration in the
 * membership Step 2 refactor. It belongs to the membership aggregate
 * and its persistence is sealed inside `MembershipModule` —
 * `PostgresProjectMemberRepository` is the sole
 * `@InjectRepository(ProjectMember)` site, and external reads go
 * through `PROJECT_MEMBER_QUERY_TOKEN`.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User, Project, Issue])],
  exports: [TypeOrmModule],
})
export class CoreEntitiesModule {}
