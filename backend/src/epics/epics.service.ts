// src/epics/epics.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Epic } from './entities/epic.entity';
import { Story } from './entities/story.entity';
import { ProjectsService } from '../projects/projects.service';
import { ProjectMembersService } from 'src/membership/project-members/project-members.service';
import { CreateEpicDto } from './dto/create-epic.dto';
import { UpdateEpicDto } from './dto/update-epic.dto';
import { CreateStoryDto } from './dto/create-story.dto';
import { UpdateStoryDto } from './dto/update-story.dto';

@Injectable()
export class EpicsService {
  constructor(
    @InjectRepository(Epic) private epicRepo: Repository<Epic>,
    @InjectRepository(Story) private storyRepo: Repository<Story>,
    private projectsService: ProjectsService,
    private membersService: ProjectMembersService,
  ) {}

  // --- Epics CRUD ---

  async createEpic(
    projectId: string,
    userId: string,
    dto: CreateEpicDto,
  ): Promise<Epic> {
    await this.projectsService.findOneById(projectId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== 'ProjectLead') throw new ForbiddenException();
    const epic = this.epicRepo.create({ projectId, ...dto });
    return this.epicRepo.save(epic);
  }

  async listEpics(projectId: string, userId: string): Promise<Epic[]> {
    await this.projectsService.findOneById(projectId);
    await this.membersService.getUserRole(projectId, userId);
    return this.epicRepo.find({ where: { projectId }, relations: ['stories'] });
  }

  async getEpic(
    projectId: string,
    epicId: string,
    userId: string,
  ): Promise<Epic> {
    const epic = await this.epicRepo.findOne({
      where: { id: epicId, projectId },
      relations: ['stories'],
    });
    if (!epic) throw new NotFoundException('Epic not found');
    await this.membersService.getUserRole(projectId, userId);
    return epic;
  }

  async updateEpic(
    projectId: string,
    epicId: string,
    userId: string,
    dto: UpdateEpicDto,
  ): Promise<Epic> {
    const epic = await this.getEpic(projectId, epicId, userId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== 'ProjectLead') throw new ForbiddenException();
    Object.assign(epic, dto);
    return this.epicRepo.save(epic);
  }

  async deleteEpic(
    projectId: string,
    epicId: string,
    userId: string,
  ): Promise<void> {
    const epic = await this.getEpic(projectId, epicId, userId);
    const role = await this.membersService.getUserRole(projectId, userId);
    if (role !== 'ProjectLead') throw new ForbiddenException();
    await this.epicRepo.remove(epic);
  }

  // --- Stories CRUD ---

  async createStory(
    projectId: string,
    epicId: string,
    userId: string,
    dto: CreateStoryDto,
  ): Promise<Story> {
    await this.getEpic(projectId, epicId, userId);
    await this.membersService.getUserRole(projectId, userId);
    const story = this.storyRepo.create({ epicId, ...dto });
    return this.storyRepo.save(story);
  }

  async listStories(
    projectId: string,
    epicId: string,
    userId: string,
  ): Promise<Story[]> {
    await this.getEpic(projectId, epicId, userId);
    return this.storyRepo.find({ where: { epicId } });
  }

  async getStory(
    projectId: string,
    epicId: string,
    storyId: string,
    userId: string,
  ): Promise<Story> {
    const story = await this.storyRepo.findOneBy({ id: storyId, epicId });
    if (!story) throw new NotFoundException('Story not found');
    await this.getEpic(projectId, epicId, userId);
    return story;
  }

  async updateStory(
    projectId: string,
    epicId: string,
    storyId: string,
    userId: string,
    dto: UpdateStoryDto,
  ): Promise<Story> {
    const story = await this.getStory(projectId, epicId, storyId, userId);
    await this.membersService.getUserRole(projectId, userId);
    Object.assign(story, dto);
    return this.storyRepo.save(story);
  }

  async deleteStory(
    projectId: string,
    epicId: string,
    storyId: string,
    userId: string,
  ): Promise<void> {
    const story = await this.getStory(projectId, epicId, storyId, userId);
    await this.membersService.getUserRole(projectId, userId);
    await this.storyRepo.remove(story);
  }
}
