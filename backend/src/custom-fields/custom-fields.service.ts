// src/custom-fields/custom-fields.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CustomFieldDefinition } from './entities/custom-field-definition.entity';
import { CustomFieldValue } from './entities/custom-field-value.entity';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';
import { ProjectMembersService } from '../membership/project-members/project-members.service';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { AuditLogsService } from '../audit/audit-logs.service';

/**
 * User context for tenant-scoped operations
 */
interface UserContext {
  userId: string;
  organizationId: string;
}

/**
 * CustomFieldsService - Manages custom field definitions and values
 *
 * Security:
 * - IDOR protection via ProjectMembersService (Phase 2)
 * - Tenant isolation via organizationId in ALL queries (Phase 3)
 */
@Injectable()
export class CustomFieldsService {
  constructor(
    @InjectRepository(CustomFieldDefinition)
    private definitionsRepository: Repository<CustomFieldDefinition>,
    @InjectRepository(CustomFieldValue)
    private valuesRepository: Repository<CustomFieldValue>,
    private membersService: ProjectMembersService,
    private readonly auditLogsService: AuditLogsService,
  ) { }

  /**
   * Validate user has required role in project
   * @throws ForbiddenException if user lacks required role
   */
  private async validateProjectAccess(
    userId: string,
    projectId: string,
    requiredRole: ProjectRole,
  ): Promise<void> {
    const userRole = await this.membersService.getUserRole(projectId, userId);

    if (requiredRole === ProjectRole.PROJECT_LEAD) {
      if (userRole !== ProjectRole.PROJECT_LEAD) {
        throw new ForbiddenException(
          'Only Project Leads can modify custom field schemas',
        );
      }
    } else if (requiredRole === ProjectRole.MEMBER) {
      if (
        userRole !== ProjectRole.PROJECT_LEAD &&
        userRole !== ProjectRole.MEMBER
      ) {
        throw new ForbiddenException(
          'You must be a project member to update custom field values',
        );
      }
    }
  }

  /**
   * Create a custom field definition (schema)
   * Requires: PROJECT_LEAD role
   * SECURITY: Stamps organizationId from user context (never from client)
   */
  async createDefinition(
    userContext: UserContext,
    createDto: CreateCustomFieldDto,
  ): Promise<CustomFieldDefinition> {
    // IDOR Protection: Validate user is PROJECT_LEAD in target project
    await this.validateProjectAccess(
      userContext.userId,
      createDto.projectId,
      ProjectRole.PROJECT_LEAD,
    );

    // TENANT ISOLATION: Stamp organizationId from JWT context
    const definition = this.definitionsRepository.create({
      ...createDto,
      organizationId: userContext.organizationId, // NEVER trust client input
    });

    const saved = await this.definitionsRepository.save(definition);

    // Audit: CUSTOM_FIELD_CREATED (HIGH severity - schema change)
    void this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: userContext.organizationId,
      actor_id: userContext.userId,
      resource_type: 'CustomFieldDefinition',
      resource_id: saved.id,
      action_type: 'CREATE',
      metadata: {
        event: 'CUSTOM_FIELD_CREATED',
        fieldName: saved.name,
        fieldType: saved.type,
        projectId: saved.projectId,
        severity: 'HIGH',
      },
    });

    return saved;
  }

  /**
   * List all custom field definitions for a project
   * SECURITY: Query scoped by organizationId
   */
  async findAllDefinitions(
    userContext: UserContext,
    projectId: string,
  ): Promise<CustomFieldDefinition[]> {
    await this.validateProjectAccess(
      userContext.userId,
      projectId,
      ProjectRole.MEMBER,
    );

    // TENANT ISOLATION: Always filter by organizationId
    return this.definitionsRepository.find({
      where: {
        organizationId: userContext.organizationId,
        projectId,
      },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Get a single custom field definition
   * SECURITY: Query scoped by organizationId
   */
  async findOneDefinition(
    userContext: UserContext,
    id: string,
  ): Promise<CustomFieldDefinition> {
    // TENANT ISOLATION: Query includes organizationId
    const definition = await this.definitionsRepository.findOne({
      where: {
        id,
        organizationId: userContext.organizationId,
      },
    });

    if (!definition) {
      throw new NotFoundException(
        `Custom field definition with ID ${id} not found`,
      );
    }

    await this.validateProjectAccess(
      userContext.userId,
      definition.projectId,
      ProjectRole.MEMBER,
    );

    return definition;
  }

  /**
   * Update a custom field definition (schema modification)
   * SECURITY: Query scoped by organizationId
   */
  async updateDefinition(
    userContext: UserContext,
    id: string,
    updateDto: UpdateCustomFieldDto,
  ): Promise<CustomFieldDefinition> {
    // TENANT ISOLATION: Query includes organizationId
    const definition = await this.definitionsRepository.findOne({
      where: {
        id,
        organizationId: userContext.organizationId,
      },
    });

    if (!definition) {
      throw new NotFoundException(
        `Custom field definition with ID ${id} not found`,
      );
    }

    await this.validateProjectAccess(
      userContext.userId,
      definition.projectId,
      ProjectRole.PROJECT_LEAD,
    );

    const oldName = definition.name;
    Object.assign(definition, updateDto);
    const saved = await this.definitionsRepository.save(definition);

    // Audit: CUSTOM_FIELD_UPDATED (MEDIUM severity)
    void this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: userContext.organizationId,
      actor_id: userContext.userId,
      resource_type: 'CustomFieldDefinition',
      resource_id: saved.id,
      action_type: 'UPDATE',
      metadata: {
        event: 'CUSTOM_FIELD_UPDATED',
        fieldName: saved.name,
        oldName: oldName !== saved.name ? oldName : undefined,
        projectId: saved.projectId,
        severity: 'MEDIUM',
      },
    });

    return saved;
  }

  /**
   * Delete a custom field definition (destructive)
   * SECURITY: Query scoped by organizationId
   */
  async removeDefinition(userContext: UserContext, id: string): Promise<void> {
    // TENANT ISOLATION: Query includes organizationId
    const definition = await this.definitionsRepository.findOne({
      where: {
        id,
        organizationId: userContext.organizationId,
      },
    });

    if (!definition) {
      throw new NotFoundException(
        `Custom field definition with ID ${id} not found`,
      );
    }

    await this.validateProjectAccess(
      userContext.userId,
      definition.projectId,
      ProjectRole.PROJECT_LEAD,
    );

    // Capture snapshot before deletion
    const snapshot = {
      id: definition.id,
      name: definition.name,
      type: definition.type,
      projectId: definition.projectId,
    };

    await this.definitionsRepository.remove(definition);

    // Audit: CUSTOM_FIELD_DELETED (HIGH severity - destructive)
    void this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: userContext.organizationId,
      actor_id: userContext.userId,
      resource_type: 'CustomFieldDefinition',
      resource_id: snapshot.id,
      action_type: 'DELETE',
      metadata: {
        event: 'CUSTOM_FIELD_DELETED',
        fieldName: snapshot.name,
        fieldType: snapshot.type,
        projectId: snapshot.projectId,
        severity: 'HIGH',
      },
    });
  }

  /**
   * Get custom field values for an issue
   * SECURITY: Project membership validated
   */
  async getValuesForIssue(
    userContext: UserContext,
    issueId: string,
    projectId: string,
  ): Promise<CustomFieldValue[]> {
    await this.validateProjectAccess(
      userContext.userId,
      projectId,
      ProjectRole.MEMBER,
    );

    return this.valuesRepository.find({
      where: { issueId },
      relations: ['definition'],
    });
  }

  /**
   * Update custom field values for an issue
   * SECURITY: Project membership validated
   * PERFORMANCE: Bulk fetch + single save (Phase 5 optimization)
   *
   * Complexity: O(1) database operations (2 queries total)
   * - 1 bulk SELECT with In() operator
   * - 1 bulk INSERT/UPDATE with save([...entities])
   */
  async updateValuesForIssue(
    userContext: UserContext,
    issueId: string,
    projectId: string,
    values: { fieldId: string; value: string }[],
  ): Promise<CustomFieldValue[]> {
    await this.validateProjectAccess(
      userContext.userId,
      projectId,
      ProjectRole.MEMBER,
    );

    if (values.length === 0) {
      return [];
    }

    // Step 1: Extract all fieldIds from payload
    const fieldIds = values.map((v) => v.fieldId);

    // Step 2: Bulk fetch ALL existing values in ONE query
    // Uses In() operator instead of N individual findOne() calls
    const existingValues = await this.valuesRepository.find({
      where: {
        issueId,
        fieldId: In(fieldIds),
      },
    });

    // Step 3: Build lookup map for O(1) access
    const existingMap = new Map<string, CustomFieldValue>();
    for (const existing of existingValues) {
      existingMap.set(existing.fieldId, existing);
    }

    // Step 4: Prepare all entities (update existing or create new)
    const entitiesToSave: CustomFieldValue[] = [];

    for (const val of values) {
      const existing = existingMap.get(val.fieldId);

      if (existing) {
        // Update existing entity
        existing.value = val.value;
        entitiesToSave.push(existing);
      } else {
        // Create new entity
        const newValue = this.valuesRepository.create({
          issueId,
          fieldId: val.fieldId,
          value: val.value,
        });
        entitiesToSave.push(newValue);
      }
    }

    // Step 5: Single bulk save (handles both INSERT and UPDATE)
    const saved = await this.valuesRepository.save(entitiesToSave);

    // Audit: CUSTOM_FIELD_VALUES_UPDATED (LOW severity - routine data)
    void this.auditLogsService.log({
      event_uuid: uuidv4(),
      timestamp: new Date(),
      tenant_id: userContext.organizationId,
      actor_id: userContext.userId,
      resource_type: 'CustomFieldValue',
      resource_id: issueId,
      action_type: 'UPDATE',
      metadata: {
        event: 'CUSTOM_FIELD_VALUES_UPDATED',
        issueId,
        projectId,
        fieldsUpdated: values.length,
        severity: 'LOW',
      },
    });

    return saved;
  }
}

