// src/taxonomy/taxonomy.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

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
    return this.labelRepo.save(lbl);
  }

  async listLabels(projectId: string, userId: string): Promise<Label[]> {
    await this.projectsService.findOneById(projectId);
    await this.membersService.getUserRole(projectId, userId);
    return this.labelRepo.find({ where: { projectId } });
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
    await this.labelRepo.remove(lbl);
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
    return this.compRepo.save(cmp);
  }

  async listComponents(
    projectId: string,
    userId: string,
  ): Promise<Component[]> {
    await this.projectsService.findOneById(projectId);
    await this.membersService.getUserRole(projectId, userId);
    return this.compRepo.find({ where: { projectId } });
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
    await this.compRepo.remove(cmp);
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
