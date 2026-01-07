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
import { Role } from '../../rbac/entities/role.entity';

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
   * Dynamic RBAC: Reference to Role entity
   * Null until migration populates it based on roleName
   */
  @Column({ type: 'uuid', nullable: true })
  roleId: string | null;

  @ManyToOne(() => Role, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'roleId' })
  role: Role | null;
}
