import { Test, TestingModule } from '@nestjs/testing';
import { AutomationRulesService } from './automation-rules.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  AutomationRule,
  AutomationRuleStatus,
} from '../entities/automation-rule.entity';
import { NotFoundException } from '@nestjs/common';

describe('AutomationRulesService', () => {
  let service: AutomationRulesService;
  let repo: any;

  const mockRule = {
    id: 'rule-1',
    projectId: 'p1',
    createdBy: 'user-1',
    name: 'Test Rule',
    triggerType: 'field_change',
    triggerConfig: {
      type: 'field_change',
      config: { field: 'status', operator: 'equals', value: 'Done' },
    },
    conditions: [
      {
        field: 'priority',
        operator: 'equals',
        value: 'High',
        logicalOperator: 'AND',
      },
    ],
    actions: [
      {
        id: 'a1',
        type: 'update_field',
        config: { field: 'resolution', value: 'Fixed' },
        order: 1,
      },
    ],
    isActive: true,
    status: AutomationRuleStatus.ACTIVE,
    executionCount: 0,
    successRate: 0,
  };

  beforeEach(async () => {
    const mockRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutomationRulesService,
        {
          provide: getRepositoryToken(AutomationRule),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<AutomationRulesService>(AutomationRulesService);
    repo = module.get(getRepositoryToken(AutomationRule));
  });

  describe('CRUD', () => {
    it('should create rule', async () => {
      repo.create.mockReturnValue(mockRule);
      repo.save.mockResolvedValue(mockRule);

      const result = await service.createRule('p1', 'user-1', {
        name: 'Test',
        triggerType: 'field_change',
        triggerConfig: mockRule.triggerConfig as any,
        actions: [],
      });

      expect(result).toEqual(mockRule);
    });

    it('should update rule', async () => {
      repo.findOne.mockResolvedValue(mockRule);
      repo.save.mockResolvedValue({ ...mockRule, name: 'Updated' });

      const result = await service.updateRule('rule-1', 'user-1', {
        name: 'Updated',
      });
      expect(result.name).toBe('Updated');
    });

    it('should throw NotFoundException on update if rule missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.updateRule('r1', 'u1', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('executeRule', () => {
    it('should execute successfully when trigger and conditions match', async () => {
      repo.findOne.mockResolvedValue(mockRule);
      repo.update.mockResolvedValue({}); // update stats

      const context = {
        status: 'Done',
        priority: 'High',
      };

      const result = await service.executeRule('rule-1', context);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(repo.update).toHaveBeenCalledWith(
        'rule-1',
        expect.objectContaining({ executionCount: 1 }),
      );
    });

    it('should fail if trigger does not match', async () => {
      repo.findOne.mockResolvedValue(mockRule);

      const context = {
        status: 'In Progress', // Mismatch
        priority: 'High',
      };

      const result = await service.executeRule('rule-1', context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Trigger conditions not met');
    });

    it('should fail if condition does not match', async () => {
      repo.findOne.mockResolvedValue(mockRule);

      const context = {
        status: 'Done',
        priority: 'Low', // Mismatch
      };

      const result = await service.executeRule('rule-1', context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('conditions not met');
    });

    it('should fail if rule is inactive', async () => {
      repo.findOne.mockResolvedValue({ ...mockRule, isActive: false });

      const result = await service.executeRule('rule-1', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('inactive');
    });
  });

  describe('processScheduledRules', () => {
    it('should execute active scheduled rules', async () => {
      const scheduledRule = {
        ...mockRule,
        triggerType: 'scheduled',
        triggerConfig: { type: 'scheduled', config: {} },
        conditions: [], // No conditions, so it proceeds to execution
      };
      repo.find.mockResolvedValue([scheduledRule]);
      repo.findOne.mockResolvedValue(scheduledRule); // for getRuleById inside executeRule -> wait, executeRule calls getRuleById which calls findOne
      repo.update.mockResolvedValue({});

      // We spy on executeRule? No, it's inside the service.
      // We can check if repo.update was called (stats update)

      await service.processScheduledRules();

      expect(repo.update).toHaveBeenCalled();
    });
  });
});
