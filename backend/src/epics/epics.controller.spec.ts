import { Test, TestingModule } from '@nestjs/testing';
import { EpicsController } from './epics.controller';

describe('EpicsController', () => {
  let controller: EpicsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EpicsController],
    }).compile();

    controller = module.get<EpicsController>(EpicsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
