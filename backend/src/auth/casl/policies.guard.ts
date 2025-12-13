import {
  SetMetadata,
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppAbility, CaslAbilityFactory } from './casl-ability.factory';
import { ProjectMembersService } from '../../membership/project-members/project-members.service';
import { CacheService } from '../../cache/cache.service';
import { ProjectRole } from '../../membership/enums/project-role.enum';
import { Request } from 'express';
import { JwtAuthenticatedRequest } from '../../auth/interface/jwt-authenticated-request.interface';
import { User } from '../../users/entities/user.entity';

interface IPolicyHandler {
  handle(ability: AppAbility): boolean;
}

type PolicyHandlerCallback = (ability: AppAbility) => boolean;

export type PolicyHandler = IPolicyHandler | PolicyHandlerCallback;

export const CHECK_POLICIES_KEY = 'check_policy';
export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);

@Injectable()
export class PoliciesGuard implements CanActivate {
  private readonly CACHE_TTL = 300;

  constructor(
    private reflector: Reflector,
    private caslAbilityFactory: CaslAbilityFactory,
    private projectMembersService: ProjectMembersService,
    private cacheService: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policyHandlers = this.reflector.get<PolicyHandler[]>(
      CHECK_POLICIES_KEY,
      context.getHandler(),
    );

    // If no policies, allow (or fallback to other guards)
    if (!policyHandlers) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<JwtAuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Resolve Project Context

    const projectId = ((request.params as Record<string, any>)?.projectId ||
      (request.params as Record<string, any>)?.id ||
      (request.query as Record<string, any>)?.projectId ||
      (request.body as Record<string, any>)?.projectId) as unknown as string;

    let projectRole: ProjectRole | null = null;

    if (projectId) {
      const cacheKey = `project_role:${projectId}:${user.userId}`;
      const cachedRole = await this.cacheService.get<string>(cacheKey);
      if (cachedRole) {
        projectRole = cachedRole as ProjectRole;
      } else {
        projectRole = (await this.projectMembersService.getUserRole(
          projectId,
          user.userId,
        )) as ProjectRole;
        if (projectRole) {
          await this.cacheService.set(cacheKey, projectRole, {
            ttl: this.CACHE_TTL,
          });
        }
      }
    }

    const ability = this.caslAbilityFactory.createForUser(
      user as unknown as User,
      projectRole,
    );

    return policyHandlers.every((handler) =>
      this.execPolicyHandler(handler, ability),
    );
  }

  private execPolicyHandler(handler: PolicyHandler, ability: AppAbility) {
    if (typeof handler === 'function') {
      return handler(ability);
    }
    return handler.handle(ability);
  }
}
