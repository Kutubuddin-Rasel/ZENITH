import { Test, TestingModule } from '@nestjs/testing';
import { EpicsService } from './epics.service';

describe('EpicsService', () => {
  let service: EpicsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EpicsService],
    }).compile();

    service = module.get<EpicsService>(EpicsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
