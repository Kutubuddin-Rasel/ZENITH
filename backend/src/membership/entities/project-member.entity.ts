import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Project } from '../../projects/entities/project.entity';

import { ProjectRole } from '../enums/project-role.enum';

@Entity({ name: 'project_members' })
@Index('IDX_project_member_project_id', ['projectId'])
@Index('IDX_project_member_user_id', ['userId'])
@Index('IDX_project_member_role', ['roleName'])
@Index('IDX_project_member_role_id', ['roleId'])
export class ProjectMember {
  @PrimaryColumn()
  projectId: string;

  @PrimaryColumn()
  userId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /**
   * Legacy role name (kept for backward compatibility)
   * @deprecated Use roleId and the Role entity for permission checks
   */
  @Column({
    type: 'enum',
    enum: ProjectRole,
    default: ProjectRole.MEMBER,
  })
  roleName: ProjectRole;

  /**
   * Dynamic RBAC: Scalar foreign key to `roles.id`.
   *
   * The `@ManyToOne(() => Role)` navigation property was removed in the
   * membership Step 2 refactor — `ProjectMember` is the membership
   * aggregate root and must not compile-time import RBAC entities
   * (cross-aggregate boundary). The FK column and its
   * `IDX_project_member_role_id` index remain; the
   * `ON DELETE SET NULL` cascade is enforced by Postgres at the table
   * level (created by the original migration), not by the ORM.
   *
   * Consumers needing the joined Role aggregate go through the RBAC
   * module's `IRoleQueryService` using this `roleId`.
   */
  @Column({ type: 'uuid', nullable: true })
  roleId: string | null;
}
