import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Shared entities that are used across multiple modules
import { User } from '../../users/entities/user.entity';
import { Project } from '../../projects/entities/project.entity';
import { Issue } from '../../issues/entities/issue.entity';
import { ProjectMember } from '../../membership/entities/project-member.entity';

/**
 * CoreEntitiesModule
 * 
 * Provides shared TypeORM repositories for entities that are commonly
 * needed across multiple modules. This eliminates the need for each
 * module to import TypeOrmModule.forFeature() for shared entities.
 * 
 * Being @Global means any module can inject these repositories without
 * explicitly importing this module.
 */
@Global()
@Module({
    imports: [
        TypeOrmModule.forFeature([
            User,
            Project,
            Issue,
            ProjectMember,
        ]),
    ],
    exports: [TypeOrmModule],
})
export class CoreEntitiesModule { }
