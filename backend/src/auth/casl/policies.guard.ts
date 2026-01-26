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

    let roleId: string | null = null;

    if (projectId) {
      const cacheKey = `project_role_id:${projectId}:${user.userId}`;
      const cachedRoleId = await this.cacheService.get<string>(cacheKey);
      if (cachedRoleId) {
        roleId = cachedRoleId;
      } else {
        // Get role details and resolve roleId
        const roleDetails =
          await this.projectMembersService.getMemberRoleDetails(
            projectId,
            user.userId,
          );
        if (roleDetails) {
          roleId = roleDetails.roleId;
          if (roleId) {
            await this.cacheService.set(cacheKey, roleId, {
              ttl: this.CACHE_TTL,
            });
          }
        }
      }
    }

    // createForUser is now async - must await
    const ability = await this.caslAbilityFactory.createForUser(
      user as unknown as User,
      roleId,
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
