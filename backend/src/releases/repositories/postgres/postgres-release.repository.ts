// src/releases/repositories/postgres/postgres-release.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Release } from '../../entities/release.entity';
import { IssueRelease } from '../../entities/issue-release.entity';
import { ReleaseAttachment } from '../../entities/release-attachment.entity';
import type {
  IReleaseRepository,
  ReleaseListCriteria,
} from '../../interfaces/releases.interfaces';

/**
 * Postgres Release Repository.
 *
 * The ONLY class — inside or outside the releases module — that owns TypeORM's
 * `Repository<Release>`, `Repository<IssueRelease>`, and
 * `Repository<ReleaseAttachment>`. Every domain service depends on
 * `IReleaseRepository` via `RELEASE_REPOSITORY_TOKEN`, so the ORM and
 * transaction strategy can be swapped without touching business logic, and the
 * SRP rule "no QueryBuilders in services" is enforced (the pagination builder
 * relocated here from the god class).
 *
 * EntityManager-passthrough: each write resolves its working repository as
 * `manager ? manager.getRepository(X) : this.<repo>`, so when a command service
 * supplies its `transaction(manager => …)` it joins that transaction; called
 * bare, it runs standalone (binary-compatible with the legacy non-tx paths).
 */
@Injectable()
export class PostgresReleaseRepository implements IReleaseRepository {
  constructor(
    @InjectRepository(Release)
    private readonly relRepo: Repository<Release>,
    @InjectRepository(IssueRelease)
    private readonly linkRepo: Repository<IssueRelease>,
    @InjectRepository(ReleaseAttachment)
    private readonly attachmentRepo: Repository<ReleaseAttachment>,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // Release
  // ---------------------------------------------------------------------------

  createRelease(data: Partial<Release>): Release {
    return this.relRepo.create(data);
  }

  saveRelease(release: Release, manager?: EntityManager): Promise<Release> {
    const repo = manager ? manager.getRepository(Release) : this.relRepo;
    return repo.save(release);
  }

  async removeRelease(
    release: Release,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(Release) : this.relRepo;
    await repo.remove(release);
  }

  findReleaseDetail(
    projectId: string,
    releaseId: string,
  ): Promise<Release | null> {
    return this.relRepo.findOne({
      where: { id: releaseId, projectId },
      relations: ['issueLinks', 'issueLinks.issue'],
    });
  }

  findAllReleases(projectId: string): Promise<Release[]> {
    return this.relRepo.find({
      where: { projectId },
      relations: ['issueLinks'],
      order: { createdAt: 'DESC' },
    });
  }

  findReleasesPaginated(
    projectId: string,
    criteria: ReleaseListCriteria,
  ): Promise<[Release[], number]> {
    const qb = this.relRepo
      .createQueryBuilder('release')
      .leftJoinAndSelect('release.issueLinks', 'issueLinks')
      .where('release.projectId = :projectId', { projectId });

    if (criteria.status) {
      qb.andWhere('release.status = :status', { status: criteria.status });
    }
    if (criteria.search) {
      qb.andWhere('release.name ILIKE :search', {
        search: `%${criteria.search}%`,
      });
    }

    qb.orderBy(`release.${criteria.sortBy}`, criteria.sortOrder)
      .addOrderBy('release.id', 'ASC') // deterministic tiebreaker for stable paging
      .skip(criteria.skip)
      .take(criteria.take);

    return qb.getManyAndCount();
  }

  async findVersionNames(projectId: string): Promise<string[]> {
    // Projected single-column read — feeds O(n) semver max-scan without
    // hydrating full entities or their issueLinks (DSA optimization).
    const rows = await this.relRepo.find({
      where: { projectId },
      select: { name: true },
    });
    return rows.map((r) => r.name);
  }

  // ---------------------------------------------------------------------------
  // IssueRelease (join)
  // ---------------------------------------------------------------------------

  findLinksByRelease(releaseId: string): Promise<IssueRelease[]> {
    return this.linkRepo.find({
      where: { releaseId },
      relations: ['issue', 'issue.assignee'],
    });
  }

  findLink(releaseId: string, issueId: string): Promise<IssueRelease | null> {
    return this.linkRepo.findOneBy({ releaseId, issueId });
  }

  createLink(releaseId: string, issueId: string): IssueRelease {
    return this.linkRepo.create({ releaseId, issueId });
  }

  saveLink(link: IssueRelease, manager?: EntityManager): Promise<IssueRelease> {
    const repo = manager ? manager.getRepository(IssueRelease) : this.linkRepo;
    return repo.save(link);
  }

  async removeLink(link: IssueRelease, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(IssueRelease) : this.linkRepo;
    await repo.remove(link);
  }

  async insertLinks(
    rows: { releaseId: string; issueId: string }[],
    manager?: EntityManager,
  ): Promise<void> {
    if (rows.length === 0) return;
    const repo = manager ? manager.getRepository(IssueRelease) : this.linkRepo;
    // Single multi-row INSERT — replaces the god class's per-issue await loop.
    await repo.insert(rows);
  }

  // ---------------------------------------------------------------------------
  // ReleaseAttachment
  // ---------------------------------------------------------------------------

  findAttachmentsByRelease(releaseId: string): Promise<ReleaseAttachment[]> {
    return this.attachmentRepo.find({
      where: { releaseId },
      relations: ['uploader'],
      order: { createdAt: 'DESC' },
    });
  }

  createAttachment(data: Partial<ReleaseAttachment>): ReleaseAttachment {
    return this.attachmentRepo.create(data);
  }

  saveAttachment(
    attachment: ReleaseAttachment,
    manager?: EntityManager,
  ): Promise<ReleaseAttachment> {
    const repo = manager
      ? manager.getRepository(ReleaseAttachment)
      : this.attachmentRepo;
    return repo.save(attachment);
  }

  findAttachment(
    releaseId: string,
    attachmentId: string,
  ): Promise<ReleaseAttachment | null> {
    return this.attachmentRepo.findOneBy({ id: attachmentId, releaseId });
  }

  async removeAttachment(
    attachment: ReleaseAttachment,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(ReleaseAttachment)
      : this.attachmentRepo;
    await repo.remove(attachment);
  }

  // ---------------------------------------------------------------------------
  // Transaction boundary
  // ---------------------------------------------------------------------------

  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(work);
  }
}
