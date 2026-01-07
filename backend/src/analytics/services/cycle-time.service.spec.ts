import { Test, TestingModule } from '@nestjs/testing';
import { CycleTimeService } from './cycle-time.service';
import { DataSource } from 'typeorm';
import { RevisionsService } from '../../revisions/revisions.service';
import { TenantContext } from '../../core/tenant/tenant-context.service';

describe('CycleTimeService', () => {
    let service: CycleTimeService;
    let dataSource: any;
    let revisionsService: any;

    const mockIssue = {
        id: 'issue-1',
        title: 'Test Issue',
        status: 'Done',
        updatedAt: new Date('2023-01-02T12:00:00Z'),
    };

    const mockRevisions = [
        {
            createdAt: '2023-01-02T12:00:00Z',
            action: 'UPDATE',
            snapshot: { status: 'In Progress' }, // Transition FROM In Progress TO Done
        },
        {
            createdAt: '2023-01-01T12:00:00Z',
            action: 'UPDATE',
            snapshot: { status: 'To Do' }, // Transition FROM To Do TO In Progress (Start Time)
        },
        {
            createdAt: '2023-01-01T10:00:00Z',
            action: 'CREATE', // Ignored
            snapshot: { status: 'To Do' },
        },
    ];
    beforeEach(async () => {
        const mockDataSource = {
            query: jest.fn(),
        };

        const mockRevisionsService = {
            list: jest.fn(),
        };

        const mockTenantContext = {
            getTenantId: jest.fn().mockReturnValue('org-1'),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CycleTimeService,
                { provide: DataSource, useValue: mockDataSource },
                { provide: RevisionsService, useValue: mockRevisionsService },
                { provide: TenantContext, useValue: mockTenantContext },
            ],
        }).compile();

        service = module.get<CycleTimeService>(CycleTimeService);
        dataSource = module.get(DataSource);
        revisionsService = module.get(RevisionsService);
    });

    describe('calculateProjectCycleTime', () => {
        it('should return empty metrics if no completed issues', async () => {
            dataSource.query.mockResolvedValue([]);

            const result = await service.calculateProjectCycleTime('p1');

            expect(result.averageDays).toBe(0);
            expect(result.data).toEqual([]);
        });

        it('should calculate cycle time for completed issues', async () => {
            dataSource.query
                .mockResolvedValueOnce([mockIssue]) // Current period issues
                .mockResolvedValueOnce([]); // Previous period issues (for trend)

            revisionsService.list.mockResolvedValue(mockRevisions);

            const result = await service.calculateProjectCycleTime('p1', 'detailed');

            expect(result.totalIssues).toBe(1);
            // Start: Jan 1 12:00, End: Jan 2 12:00. Diff: 24 hours.
            expect(result.averageDays).toBe(1.0);
            expect(result.data[0].cycleTimeHours).toBe(24);
        });

        it('should handle issues with missing history (default 1 hour)', async () => {
            dataSource.query
                .mockResolvedValueOnce([mockIssue])
                .mockResolvedValueOnce([]);

            revisionsService.list.mockResolvedValue([]); // No revisions

            const result = await service.calculateProjectCycleTime('p1', 'detailed');

            expect(result.data[0].cycleTimeHours).toBe(1); // Default fall back
        });

        it('should calculate trend (up)', async () => {
            dataSource.query
                .mockResolvedValueOnce([mockIssue]) // Current: 1 day avg
                .mockResolvedValueOnce([mockIssue]); // Previous calls calculateAverageForPeriod... 

            // Mock revisions for both calls
            // Call 1 (Current): 24 hours
            revisionsService.list.mockResolvedValueOnce(mockRevisions);

            // Call 2 (Previous): Mock a shorter cycle time revisions for previous period
            const fastRevisions = [
                { createdAt: '2023-01-01T12:00:00Z', action: 'UPDATE', snapshot: { status: 'In Progress' } },
                { createdAt: '2023-01-01T13:00:00Z', action: 'UPDATE', snapshot: { status: 'Done' } },
            ];
            revisionsService.list.mockResolvedValueOnce(fastRevisions);

            const result = await service.calculateProjectCycleTime('p1');
            expect(result.trend).toBe('up');
        });
    });
});
