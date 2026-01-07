import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Issue } from '../issues/entities/issue.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { TenantContext } from '../core/tenant/tenant-context.service';
import { ForbiddenException } from '@nestjs/common';

describe('SearchService', () => {
    let service: SearchService;
    let issuesRepo: any;
    let projectsRepo: any;
    let tenantContext: any;

    const mockIssue = {
        id: 'issue-1',
        title: 'Test Issue',
        projectId: 'proj-1',
        number: 101,
    };

    const mockProject = {
        id: 'proj-1',
        name: 'Test Project',
    };

    beforeEach(async () => {
        const mockRepo = {
            find: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
                leftJoin: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                setParameter: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                take: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([mockIssue]),
            })),
        };

        const mockTenantContext = {
            getTenantId: jest.fn().mockReturnValue('org-1'),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SearchService,
                { provide: getRepositoryToken(Issue), useValue: mockRepo },
                { provide: getRepositoryToken(Project), useValue: mockRepo },
                { provide: getRepositoryToken(User), useValue: mockRepo },
                { provide: TenantContext, useValue: mockTenantContext },
            ],
        }).compile();

        service = module.get<SearchService>(SearchService);
        issuesRepo = module.get(getRepositoryToken(Issue));
        projectsRepo = module.get(getRepositoryToken(Project));
        tenantContext = module.get(TenantContext);
    });

    describe('search', () => {
        it('should return empty keys for short query', async () => {
            const result = await service.search('a');
            expect(result.issues).toEqual([]);
        });

        it('should throw forbidden if no tenant context', async () => {
            tenantContext.getTenantId.mockReturnValue(null);
            await expect(service.search('valid query')).rejects.toThrow(ForbiddenException);
        });

        it('should perform search with tenant isolation', async () => {
            projectsRepo.find.mockResolvedValue([mockProject]);

            const result = await service.search('test');

            expect(result.issues).toHaveLength(1);
            expect(result.projects).toHaveLength(1);
            // Verify tenant isolation in projects query
            expect(projectsRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ organizationId: 'org-1' })
                })
            );
        });
    });
});
