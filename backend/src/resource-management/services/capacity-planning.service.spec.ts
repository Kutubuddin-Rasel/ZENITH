import { Test, TestingModule } from '@nestjs/testing';
import { CapacityPlanningService } from './capacity-planning.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserCapacity } from '../entities/user-capacity.entity';
import { ResourceAllocation } from '../entities/resource-allocation.entity';
import { ResourceConflict } from '../entities/resource-conflict.entity';

describe('CapacityPlanningService', () => {
  let service: CapacityPlanningService;
  let userCapacityRepo: any;
  let allocationRepo: any;
  let conflictRepo: any;

  const mockCapacity = {
    id: 'cap-1',
    date: new Date(),
    availableHours: 8,
    allocatedHours: 4,
    capacityPercentage: 50,
    user: { id: 'u1', name: 'User 1' },
    allocations: [],
  };

  beforeEach(async () => {
    const mockUserCapacityRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const mockAllocationRepo = {
      find: jest.fn(),
    };

    const mockConflictRepo = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CapacityPlanningService,
        {
          provide: getRepositoryToken(UserCapacity),
          useValue: mockUserCapacityRepo,
        },
        {
          provide: getRepositoryToken(ResourceAllocation),
          useValue: mockAllocationRepo,
        },
        {
          provide: getRepositoryToken(ResourceConflict),
          useValue: mockConflictRepo,
        },
      ],
    }).compile();

    service = module.get<CapacityPlanningService>(CapacityPlanningService);
    userCapacityRepo = module.get(getRepositoryToken(UserCapacity));
    allocationRepo = module.get(getRepositoryToken(ResourceAllocation));
    conflictRepo = module.get(getRepositoryToken(ResourceConflict));
  });

  describe('getUserCapacity', () => {
    it('should return capacity for range', async () => {
      userCapacityRepo.find.mockResolvedValue([mockCapacity]);
      const result = await service.getUserCapacity(
        'u1',
        new Date(),
        new Date(),
      );
      expect(result).toEqual([mockCapacity]);
    });
  });

  describe('calculateCapacityUtilization', () => {
    it('should calculate existing capacity', async () => {
      userCapacityRepo.findOne.mockResolvedValue(mockCapacity);
      conflictRepo.find.mockResolvedValue([]);

      const result = await service.calculateCapacityUtilization(
        'u1',
        new Date(),
      );

      expect(result.utilizationPercentage).toBe(50);
      expect(result.isOverallocated).toBe(false);
    });

    it('should create default capacity if missing', async () => {
      userCapacityRepo.findOne.mockResolvedValue(null);
      userCapacityRepo.create.mockReturnValue({
        ...mockCapacity,
        availableHours: 8,
      });
      userCapacityRepo.save.mockResolvedValue({});

      const result = await service.calculateCapacityUtilization(
        'u1',
        new Date(),
      );

      expect(userCapacityRepo.save).toHaveBeenCalled();
      expect(result.availableHours).toBe(8);
    });
  });

  describe('identifyCapacityBottlenecks', () => {
    it('should return bottlenecks for overallocated users', async () => {
      allocationRepo.find.mockResolvedValue([
        { user: { id: 'u1', name: 'User 1' }, startDate: new Date() },
      ]);

      // Spy on calculateCapacityUtilization logic
      // Since it's internal, we mock the repo calls it makes
      userCapacityRepo.findOne.mockResolvedValue({
        ...mockCapacity,
        capacityPercentage: 120, // Overallocated
        allocatedHours: 10,
        availableHours: 8,
      });
      conflictRepo.find.mockResolvedValue([]);

      // For getAllocationProjects
      allocationRepo.find
        .mockResolvedValueOnce([
          { user: { id: 'u1' }, startDate: new Date() }, // First call from main loop
        ])
        .mockResolvedValueOnce([
          { project: { name: 'Proj A' } }, // Second call inside getAllocationProjects
        ]);

      const result = await service.identifyCapacityBottlenecks('p1');

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('u1');
      expect(result[0].conflictingProjects).toContain('Proj A');
    });
  });
});
