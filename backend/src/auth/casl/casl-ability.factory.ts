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
import { ProjectRole } from '../../membership/enums/project-role.enum';

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

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: User, projectRole: ProjectRole | null) {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(
      PureAbility as AbilityClass<AppAbility>,
    );

    if (user.isSuperAdmin) {
      can(Action.Manage, 'all'); // SuperAdmin can do anything
    } else {
      // Global Permissions (e.g. Profile)
      can(Action.Read, User, { id: user.id });
      can(Action.Update, User, { id: user.id });

      // Project Scoped Permissions
      if (projectRole) {
        this.setProjectPermissions(can, cannot, projectRole, user);
      }
    }

    return build({
      // Read https://casl.js.org/v5/en/guide/subject-type-detection#use-classes-as-subject-types
      detectSubjectType: (item) =>
        item.constructor as ExtractSubjectType<Subjects>,
    });
  }

  private setProjectPermissions(
    can: AbilityBuilder<AppAbility>['can'],
    cannot: AbilityBuilder<AppAbility>['cannot'],
    role: ProjectRole,
    user: User,
  ) {
    // Common for all members
    can(Action.Read, Project);
    can(Action.Read, Issue);
    can(Action.Read, Comment);

    switch (role) {
      case ProjectRole.PROJECT_LEAD:
        can(Action.Manage, Project); // Manage everything in project context (guard handles context)
        can(Action.Manage, Issue);
        can(Action.Manage, Comment);
        break;

      case ProjectRole.MEMBER:
      case ProjectRole.DEVELOPER:
      case ProjectRole.QA:
        // Issues
        can(Action.Create, Issue);
        can(Action.Update, Issue); // Can update any issue? Or only own? Zenith legacy = Any Member can update.
        // can(Action.Delete, Issue); // Usually restricted to Lead? Let's say Member CANNOT delete.

        // Comments
        can(Action.Create, Comment);
        can(Action.Update, Comment, { authorId: user.id }); // Own comment only
        can(Action.Delete, Comment, { authorId: user.id }); // Own comment only
        break;

      case ProjectRole.VIEWER:
        // Read only (Already set in common)
        break;
    }
  }
}
