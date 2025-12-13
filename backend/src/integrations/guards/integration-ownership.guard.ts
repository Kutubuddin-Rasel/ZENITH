import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Integration } from '../entities/integration.entity';

interface RequestUser {
  id: string;
  organizationId?: string;
  email: string;
}

interface TypedRequest {
  user?: RequestUser;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

/**
 * Guard to verify that the requesting user's organization owns the target integration.
 *
 * This prevents cross-tenant access to integrations.
 * The guard extracts integrationId from:
 * - Request body (for POST requests)
 * - Route params (for GET/PUT/DELETE requests with :id)
 * - Query params (as fallback)
 */
@Injectable()
export class IntegrationOwnershipGuard implements CanActivate {
  private readonly logger = new Logger(IntegrationOwnershipGuard.name);

  constructor(
    @InjectRepository(Integration)
    private integrationRepo: Repository<Integration>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TypedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const organizationId = user.organizationId;
    if (!organizationId) {
      throw new ForbiddenException('Organization context required');
    }

    // Extract integrationId from various sources
    const integrationId = this.extractIntegrationId(request);
    if (!integrationId) {
      // If no integrationId found, let the request pass
      // (might be an endpoint that doesn't require it)
      return true;
    }

    // Verify ownership
    const integration = await this.integrationRepo.findOne({
      where: { id: integrationId },
      select: ['id', 'organizationId'],
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${integrationId} not found`);
    }

    if (integration.organizationId !== organizationId) {
      this.logger.warn(
        `Cross-tenant access attempt: User org ${organizationId} tried to access integration owned by ${integration.organizationId}`,
      );
      throw new ForbiddenException(
        'You do not have access to this integration',
      );
    }

    return true;
  }

  /**
   * Extracts integrationId from request in priority order:
   * 1. Route params (:id or :integrationId)
   * 2. Request body
   * 3. Query params
   */
  private extractIntegrationId(request: TypedRequest): string | null {
    // Check route params first (e.g., /integrations/:id)
    if (request.params?.id) {
      return request.params.id;
    }
    if (request.params?.integrationId) {
      return request.params.integrationId;
    }

    // Check request body (for POST endpoints)
    if (request.body?.integrationId) {
      return request.body.integrationId as string;
    }

    // Check query params as fallback
    if (request.query?.integrationId) {
      return request.query.integrationId;
    }

    return null;
  }
}
