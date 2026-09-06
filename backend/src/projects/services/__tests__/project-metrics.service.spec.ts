/* eslint-disable @typescript-eslint/require-await */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';

import { CACHE_STORE_TOKEN } from '../../../cache/constants/cache.tokens';
import { IssueRepository } from '../../../database/repositories/issue.repository';
import { RevisionRepository } from '../../../database/repositories/revision.repository';
import { IssueStatus } from '../../../issues/entities/issue.entity';

import { PROJECT_QUERY_TOKEN } from '../../constants/projects.tokens';
import { ProjectMetricsService } from '../project-metrics.service';

describe('ProjectMetricsService', () => {
  let service: ProjectMetricsService;

  const projects = { findById: jest.fn() };
  const issues = { count: jest.fn(), countByStatusForProject: jest.fn() };
  const revisions = { findByProjectId: jest.fn() };
  const cacheStore = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectMetricsService,
        { provide: PROJECT_QUERY_TOKEN, useValue: projects },
        { provide: IssueRepository, useValue: issues },
        { provide: RevisionRepository, useValue: revisions },
        { provide: CACHE_STORE_TOKEN, useValue: cacheStore },
      ],
    }).compile();

    service = module.get(ProjectMetricsService);
  });

  describe('getSummary', () => {
    it('returns the cached value when present (no DB hit)', async () => {
      cacheStore.get.mockResolvedValue({
        projectId: 'p1',
        projectName: 'Alpha',
        totalIssues: 10,
        doneIssues: 5,
        percentDone: 50,
        statusCounts: { DONE: 5, TODO: 5 },
      });

      const summary = await service.getSummary('p1');

      expect(summary.totalIssues).toBe(10);
      expect(issues.count).not.toHaveBeenCalled();
      expect(projects.findById).not.toHaveBeenCalled();
    });

    it('computes summary on cache miss and caches with project tag', async () => {
      cacheStore.get.mockResolvedValue(null);
      projects.findById.mockResolvedValue({ id: 'p1', name: 'Alpha' });
      issues.count.mockImplementation(
        async (filter: { status?: IssueStatus }) =>
          filter.status === IssueStatus.DONE ? 3 : 12,
      );
      issues.countByStatusForProject.mockResolvedValue([
        { status: 'DONE', count: '3' },
        { status: 'TODO', count: '9' },
      ]);

      const summary = await service.getSummary('p1');

      expect(summary).toEqual(
        expect.objectContaining({
          totalIssues: 12,
          doneIssues: 3,
          percentDone: 25,
          statusCounts: { DONE: 3, TODO: 9 },
        }),
      );
      expect(cacheStore.set).toHaveBeenCalledWith(
        'project:p1:summary',
        expect.any(Object),
        { ttl: 300, tags: ['project:p1'] },
      );
    });

    it('returns 0% when project has no issues (avoids divide-by-zero)', async () => {
      cacheStore.get.mockResolvedValue(null);
      projects.findById.mockResolvedValue({ id: 'p1', name: 'Alpha' });
      issues.count.mockResolvedValue(0);
      issues.countByStatusForProject.mockResolvedValue([]);

      const summary = await service.getSummary('p1');
      expect(summary.percentDone).toBe(0);
    });

    it('wraps underlying errors in BadRequestException', async () => {
      cacheStore.get.mockResolvedValue(null);
      projects.findById.mockRejectedValue(new Error('db-down'));

      await expect(service.getSummary('p1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('getActivity', () => {
    it('maps revision rows onto the activity DTO with snapshot fallback', async () => {
      revisions.findByProjectId.mockResolvedValue([
        {
          id: 'r1',
          entityType: 'Issue',
          entityId: 'i1',
          action: 'UPDATE',
          snapshot: { field: 'value' },
          changedBy: 'u1',
          createdAt: new Date('2026-05-01'),
        },
        {
          id: 'r2',
          entityType: 'Issue',
          entityId: 'i2',
          action: 'CREATE',
          snapshot: null,
          changedBy: 'u1',
          createdAt: new Date('2026-05-02'),
        },
      ]);

      const rows = await service.getActivity('p1');

      expect(rows).toHaveLength(2);
      expect(rows[0].snapshot).toEqual({ field: 'value' });
      expect(rows[1].snapshot).toEqual({}); // null fallback
    });

    it('defaults limit to 50 when omitted', async () => {
      revisions.findByProjectId.mockResolvedValue([]);
      await service.getActivity('p1');
      expect(revisions.findByProjectId).toHaveBeenCalledWith('p1', 50);
    });
  });
});
