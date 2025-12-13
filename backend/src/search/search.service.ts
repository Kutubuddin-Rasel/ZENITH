import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Issue } from '../issues/entities/issue.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';

export interface SearchResult {
  issues: { id: string; title: string; key: string }[];
  projects: { id: string; name: string }[];
  users: { id: string; name: string }[];
}

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Issue)
    private issuesRepo: Repository<Issue>,
    @InjectRepository(Project)
    private projectsRepo: Repository<Project>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
  ) {}

  async search(query: string): Promise<SearchResult> {
    if (!query || query.length < 2) {
      return { issues: [], projects: [], users: [] };
    }

    // Parallelize queries for speed
    const [issues, projects, users] = await Promise.all([
      this.issuesRepo.find({
        where: { title: ILike(`%${query}%`) }, // Add Access Control in future
        take: 5,
        select: ['id', 'title'],
      }),
      this.projectsRepo.find({
        where: { name: ILike(`%${query}%`) },
        take: 3,
        select: ['id', 'name'],
      }),
      this.usersRepo.find({
        where: { name: ILike(`%${query}%`) },
        take: 3,
        select: ['id', 'name'],
      }),
    ]);

    return {
      issues: issues.map((i) => ({
        id: i.id,
        title: i.title,
        key: `ISSUE-${i.id.substring(0, 4)}`,
      })), // Key format is just mock if not in entity
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
      users: users.map((u) => ({ id: u.id, name: u.name })),
    };
  }
}
