import {
  AbilityBuilder,
  PureAbility,
  AbilityClass,
  ExtractSubjectType,
  InferSubjects,
} from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { User } from '../../users/entities/user.entity';
import { Issue } from '../../issues/entities/issue.entity';
import { Project } from '../../projects/entities/project.entity';
import { Comment } from '../../comments/entities/comment.entity';
import { RBACService } from '../../rbac/rbac.service';

export enum Action {
  Manage = 'manage',
  Create = 'create',
  Read = 'read',
  Update = 'update',
  Delete = 'delete',
}

export type Subjects =
  | InferSubjects<typeof Issue | typeof Project | typeof Comment | typeof User>
  | 'all';

export type AppAbility = PureAbility<[Action, Subjects]>;

/**
 * CASL Ability Factory
 *
 * Creates CASL abilities for users based on database-backed RBAC.
 *
 * ARCHITECTURE (NIST AC-3 Compliant):
 * - Fetches permissions dynamically from RBACService
 * - Supports custom roles (not limited to hardcoded enums)
 * - Backward compatible via RBACService.getRoleByLegacyEnum()
 */
@Injectable()
export class CaslAbilityFactory {
  constructor(private readonly rbacService: RBACService) {}

  /**
   * Create CASL abilities for a user with a specific role
   *
   * @param user - The authenticated user
   * @param roleId - The role ID (from ProjectMember.roleId or resolved from legacy enum)
   */
  async createForUser(user: User, roleId: string | null): Promise<AppAbility> {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(
      PureAbility as AbilityClass<AppAbility>,
    );

    if (user.isSuperAdmin) {
      can(Action.Manage, 'all'); // SuperAdmin can do anything
    } else {
      // Global Permissions (e.g. Profile)
      can(Action.Read, User, { id: user.id });
      can(Action.Update, User, { id: user.id });

      // Project Scoped Permissions (dynamic from database)
      if (roleId) {
        await this.setProjectPermissionsFromDB(can, cannot, roleId, user);
      }
    }

    return build({
      detectSubjectType: (item) =>
        item.constructor as ExtractSubjectType<Subjects>,
    });
  }

  /**
   * Legacy method for backward compatibility
   * Resolves legacy enum to roleId and delegates to createForUser
   *
   * @deprecated Use createForUser with roleId instead
   */
  async createForUserWithLegacyRole(
    user: User,
    legacyRoleName: string | null,
  ): Promise<AppAbility> {
    let roleId: string | null = null;

    if (legacyRoleName) {
      const role = await this.rbacService.getRoleByLegacyEnum(legacyRoleName);
      roleId = role?.id ?? null;
    }

    return this.createForUser(user, roleId);
  }

  /**
   * Set project permissions dynamically from database
   */
  private async setProjectPermissionsFromDB(
    can: AbilityBuilder<AppAbility>['can'],
    cannot: AbilityBuilder<AppAbility>['cannot'],
    roleId: string,
    user: User,
  ): Promise<void> {
    const permissions = await this.rbacService.getRolePermissions(roleId);

    // Map permission strings to CASL abilities
    for (const permString of permissions) {
      const [resource, action] = permString.split(':');
      const caslAction = this.mapToCaslAction(action);
      const caslSubject = this.mapToCaslSubject(resource);

      if (caslAction && caslSubject) {
        // Special handling for comments - users can only update/delete their own
        if (
          caslSubject === Comment &&
          (caslAction === Action.Update || caslAction === Action.Delete)
        ) {
          can(caslAction, caslSubject as ExtractSubjectType<Subjects>, {
            authorId: user.id,
          });
        } else {
          can(caslAction, caslSubject as ExtractSubjectType<Subjects>);
        }
      }
    }
  }

  /**
   * Map permission action string to CASL Action enum
   */
  private mapToCaslAction(action: string): Action | null {
    const actionMap: Record<string, Action> = {
      create: Action.Create,
      read: Action.Read,
      view: Action.Read, // 'view' is an alias for 'read'
      update: Action.Update,
      delete: Action.Delete,
      manage: Action.Manage,
    };
    return actionMap[action.toLowerCase()] ?? null;
  }

  /**
   * Map permission resource string to CASL Subject
   */
  private mapToCaslSubject(resource: string): Subjects | null {
    const subjectMap: Record<string, Subjects> = {
      issues: Issue,
      issue: Issue,
      projects: Project,
      project: Project,
      comments: Comment,
      comment: Comment,
      users: User,
      user: User,
    };
    return subjectMap[resource.toLowerCase()] ?? null;
  }
}
