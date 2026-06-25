import { Test, TestingModule } from '@nestjs/testing';
import { StalledIssuesQueryService } from './stalled-issues-query.service';
import { ANALYTICS_READ_MODEL_TOKEN } from '../constants/analytics.tokens';
import type { StalledIssue } from '../interfaces/analytics.interfaces';

interface MockReadModel {
  findStalledIssues: jest.Mock;
}

describe('StalledIssuesQueryService', () => {
  let service: StalledIssuesQueryService;
  let readModel: MockReadModel;

  beforeEach(async () => {
    const mockReadModel: MockReadModel = {
      findStalledIssues: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StalledIssuesQueryService,
        { provide: ANALYTICS_READ_MODEL_TOKEN, useValue: mockReadModel },
      ],
    }).compile();

    service = module.get(StalledIssuesQueryService);
    readModel = module.get(ANALYTICS_READ_MODEL_TOKEN);
  });

  it('delegates to the read-model port with the 3-day stall threshold', async () => {
    const stalled: StalledIssue[] = [
      {
        id: 'i1',
        title: 'Stale',
        assigneeId: 'u1',
        projectId: 'p1',
        projectKey: 'ZEN',
        daysSinceUpdate: 5,
      },
    ];
    readModel.findStalledIssues.mockResolvedValue(stalled);

    const result = await service.getStalledIssues('p1');

    expect(result).toBe(stalled);
    expect(readModel.findStalledIssues).toHaveBeenCalledWith('p1', 3);
  });
});
