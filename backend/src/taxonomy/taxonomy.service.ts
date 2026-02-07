// src/taxonomy/taxonomy.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Label } from './entities/label.entity';
import { Component } from './entities/component.entity';
import { IssueLabel } from './entities/issue-label.entity';
import { IssueComponent } from './entities/issue-component.entity';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';
import { AssignLabelDto } from './dto/assign-label.dto';
import { UnassignLabelDto } from './dto/unassign-label.dto';
import { AssignComponentDto } from './dto/assign-component.dto';
import { UnassignComponentDto } from './dto/unassign-component.dto';
import { ProjectsService } from '../projects/projects.service';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { IssuesService } from '../issues/issues.service';
import { UpdateComponentDto } from './dto/update-component.dto';
import { CreateComponentDto } from './dto/create-component.dto';
import { ProjectRole } from '../membership/enums/project-role.enum';
import { AuditLogsService } from '../audit/audit-logs.service';
import { randomUUID } from 'crypto';

@Injectable()
export class TaxonomyService {
  constructor(
    @InjectRepository(Label) private labelRepo: Repository<Label>,
    @InjectRepository(Component) private compRepo: Repository<Component>,
    @InjectRepository(IssueLabel) private ilRepo: Repository<IssueLabel>,
    @InjectRepository(IssueComponent)
    private icRepo: Repository<IssueComponent>,
    private projectsService: ProjectsService,
    private membersService: ProjectMembersService,
    private issuesService: IssuesService,
    private auditLogsService: AuditLogsService,
  ) { }

  // — Labels CRUD —

  async createLabel(
    projectId: string,
    userId: string,
    dto: CreateLabelDto,
  ): Promise<Label> {
    await this.projectsService.findOneById(projectId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) throw new ForbiddenException();
    const lbl = this.labelRepo.create({ projectId, name: dto.name });
    const saved = await this.labelRepo.save(lbl);

    // AUDIT: Log label creation (Phase 5)
    this.auditLogsService.log({
      event_uuid: randomUUID(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: userId,
      resource_type: 'Label',
      resource_id: saved.id,
      action_type: 'CREATE',
      metadata: { name: saved.name, severity: 'LOW' },
    }).catch(() => { }); // Non-blocking

    return saved;
  }

  async listLabels(
    projectId: string,
    userId: string,
    page: number = 1,
    limit: number = 50,
    search?: string,
  ): Promise<{ data: Label[]; total: number; page: number; limit: number }> {
    await this.projectsService.findOneById(projectId);
    await this.membersService.getUserRole(projectId, userId);

    // Build where clause with optional search filter
    const where: Record<string, unknown> = { projectId };
    if (search) {
      where.name = ILike(`%${search}%`);
    }

    const [data, total] = await this.labelRepo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { name: 'ASC' },
    });

    return { data, total, page, limit };
  }

  async updateLabel(
    projectId: string,
    labelId: string,
    userId: string,
    dto: UpdateLabelDto,
  ): Promise<Label> {
    const lbl = await this.labelRepo.findOneBy({ id: labelId, projectId });
    if (!lbl) throw new NotFoundException();
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) throw new ForbiddenException();
    Object.assign(lbl, dto);
    return this.labelRepo.save(lbl);
  }

  async removeLabel(
    projectId: string,
    labelId: string,
    userId: string,
  ): Promise<void> {
    const lbl = await this.labelRepo.findOneBy({ id: labelId, projectId });
    if (!lbl) throw new NotFoundException();
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) throw new ForbiddenException();

    // Capture snapshot before deletion
    const snapshot = { name: lbl.name };
    await this.labelRepo.remove(lbl);

    // AUDIT: Log label deletion (Phase 5 - MEDIUM severity)
    this.auditLogsService.log({
      event_uuid: randomUUID(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: userId,
      resource_type: 'Label',
      resource_id: labelId,
      action_type: 'DELETE',
      metadata: { ...snapshot, severity: 'MEDIUM' },
    }).catch(() => { }); // Non-blocking
  }

  // — Label ↔ Issue assignments —

  async assignLabel(
    projectId: string,
    issueId: string,
    userId: string,
    dto: AssignLabelDto,
  ): Promise<IssueLabel> {
    await this.issuesService.findOne(projectId, issueId, userId);
    const lbl = await this.labelRepo.findOneBy({ id: dto.labelId, projectId });
    if (!lbl) throw new NotFoundException('Label not found');
    const link = this.ilRepo.create({ labelId: dto.labelId, issueId });
    return this.ilRepo.save(link);
  }

  async unassignLabel(
    projectId: string,
    issueId: string,
    userId: string,
    dto: UnassignLabelDto,
  ): Promise<void> {
    await this.issuesService.findOne(projectId, issueId, userId);
    const link = await this.ilRepo.findOneBy({
      labelId: dto.labelId,
      issueId,
    });
    if (!link) throw new NotFoundException();
    await this.ilRepo.remove(link);
  }

  // — Components CRUD —

  async createComponent(
    projectId: string,
    userId: string,
    dto: CreateComponentDto,
  ): Promise<Component> {
    await this.projectsService.findOneById(projectId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) throw new ForbiddenException();
    const cmp = this.compRepo.create({ projectId, name: dto.name });
    const saved = await this.compRepo.save(cmp);

    // AUDIT: Log component creation (Phase 5)
    this.auditLogsService.log({
      event_uuid: randomUUID(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: userId,
      resource_type: 'Component',
      resource_id: saved.id,
      action_type: 'CREATE',
      metadata: { name: saved.name, severity: 'LOW' },
    }).catch(() => { }); // Non-blocking

    return saved;
  }

  async listComponents(
    projectId: string,
    userId: string,
    page: number = 1,
    limit: number = 50,
    search?: string,
  ): Promise<{ data: Component[]; total: number; page: number; limit: number }> {
    await this.projectsService.findOneById(projectId);
    await this.membersService.getUserRole(projectId, userId);

    // Build where clause with optional search filter
    const where: Record<string, unknown> = { projectId };
    if (search) {
      where.name = ILike(`%${search}%`);
    }

    const [data, total] = await this.compRepo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { name: 'ASC' },
    });

    return { data, total, page, limit };
  }

  async updateComponent(
    projectId: string,
    componentId: string,
    userId: string,
    dto: UpdateComponentDto,
  ): Promise<Component> {
    const cmp = await this.compRepo.findOneBy({ id: componentId, projectId });
    if (!cmp) throw new NotFoundException();
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) throw new ForbiddenException();
    Object.assign(cmp, dto);
    return this.compRepo.save(cmp);
  }

  async removeComponent(
    projectId: string,
    componentId: string,
    userId: string,
  ): Promise<void> {
    const cmp = await this.compRepo.findOneBy({ id: componentId, projectId });
    if (!cmp) throw new NotFoundException();
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== ProjectRole.PROJECT_LEAD) throw new ForbiddenException();

    // Capture snapshot before deletion
    const snapshot = { name: cmp.name };
    await this.compRepo.remove(cmp);

    // AUDIT: Log component deletion (Phase 5 - MEDIUM severity)
    this.auditLogsService.log({
      event_uuid: randomUUID(),
      timestamp: new Date(),
      tenant_id: projectId,
      actor_id: userId,
      resource_type: 'Component',
      resource_id: componentId,
      action_type: 'DELETE',
      metadata: { ...snapshot, severity: 'MEDIUM' },
    }).catch(() => { }); // Non-blocking
  }

  // — Component ↔ Issue assignments —

  async assignComponent(
    projectId: string,
    issueId: string,
    userId: string,
    dto: AssignComponentDto,
  ): Promise<IssueComponent> {
    await this.issuesService.findOne(projectId, issueId, userId);
    const cmp = await this.compRepo.findOneBy({
      id: dto.componentId,
      projectId,
    });
    if (!cmp) throw new NotFoundException('Component not found');
    const link = this.icRepo.create({ componentId: dto.componentId, issueId });
    return this.icRepo.save(link);
  }

  async unassignComponent(
    projectId: string,
    issueId: string,
    userId: string,
    dto: UnassignComponentDto,
  ): Promise<void> {
    await this.issuesService.findOne(projectId, issueId, userId);
    const link = await this.icRepo.findOneBy({
      componentId: dto.componentId,
      issueId,
    });
    if (!link) throw new NotFoundException();
    await this.icRepo.remove(link);
  }
}
