import { Test, TestingModule } from '@nestjs/testing';
import { WatchersController } from './watchers.controller';

describe('WatchersController', () => {
  let controller: WatchersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WatchersController],
    }).compile();

    controller = module.get<WatchersController>(WatchersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
