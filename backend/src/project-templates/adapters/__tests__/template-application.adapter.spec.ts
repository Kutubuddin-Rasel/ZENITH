import { Test, TestingModule } from '@nestjs/testing';
import type { EntityManager } from 'typeorm';

import { TemplateApplicationService } from '../../services/template-application.service';
import { TemplateApplicationAdapter } from '../template-application.adapter';

describe('TemplateApplicationAdapter', () => {
  let adapter: TemplateApplicationAdapter;

  const templateApplicationService = {
    applyTemplate: jest.fn(),
    applyTemplateTransactional: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateApplicationAdapter,
        {
          provide: TemplateApplicationService,
          useValue: templateApplicationService,
        },
      ],
    }).compile();

    adapter = module.get(TemplateApplicationAdapter);
  });

  it('routes to the swallowing variant when manager is absent', async () => {
    await adapter.applyTemplate('p1', 't1', 'u1');

    expect(templateApplicationService.applyTemplate).toHaveBeenCalledWith(
      'p1',
      't1',
      'u1',
    );
    expect(
      templateApplicationService.applyTemplateTransactional,
    ).not.toHaveBeenCalled();
  });

  it('routes to the throwing variant when manager is present', async () => {
    const manager = { id: 'fake-em' } as unknown as EntityManager;

    await adapter.applyTemplate('p1', 't1', 'u1', manager);

    expect(
      templateApplicationService.applyTemplateTransactional,
    ).toHaveBeenCalledWith(manager, 'p1', 't1', 'u1');
    expect(templateApplicationService.applyTemplate).not.toHaveBeenCalled();
  });

  it('propagates throws from the transactional variant (parent tx must roll back)', async () => {
    const manager = { id: 'fake-em' } as unknown as EntityManager;
    templateApplicationService.applyTemplateTransactional.mockRejectedValueOnce(
      new Error('template-error'),
    );

    await expect(
      adapter.applyTemplate('p1', 't1', 'u1', manager),
    ).rejects.toThrow('template-error');
  });
});
