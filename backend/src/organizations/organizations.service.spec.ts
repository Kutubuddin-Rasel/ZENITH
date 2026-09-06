import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationRepository } from './repositories/abstract/organization.repository.abstract';
import { Organization } from './entities/organization.entity';

// Step 3 (invites extraction): invitation workflow (`inviteUser`/`validateInvite`)
// moved to `InvitationService`. `OrganizationsService` is now pure org CRUD over
// the abstract `OrganizationRepository` (DIP token) — these specs cover only that.
describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let orgRepo: jest.Mocked<OrganizationRepository>;

  const mockOrg = {
    id: 'org-1',
    name: 'Test Org',
    slug: 'test-org',
  } as Organization;

  beforeEach(async () => {
    const mockOrgRepo: Partial<jest.Mocked<OrganizationRepository>> = {
      findOne: jest.fn(),
      findBySlug: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: OrganizationRepository, useValue: mockOrgRepo },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
    orgRepo = module.get(OrganizationRepository);
  });

  describe('create', () => {
    it('should create organization with generated slug', async () => {
      orgRepo.findBySlug.mockResolvedValue(null); // slug free
      orgRepo.create.mockResolvedValue(mockOrg);
      orgRepo.save.mockResolvedValue(mockOrg);

      const result = await service.create({ name: 'Test Org' });

      expect(result).toEqual(mockOrg);
      expect(orgRepo.findBySlug).toHaveBeenCalledWith('test-org');
      expect(orgRepo.create).toHaveBeenCalledWith({
        name: 'Test Org',
        slug: 'test-org',
      });
      expect(orgRepo.save).toHaveBeenCalledWith(mockOrg);
    });

    it('should throw conflict if slug already exists', async () => {
      orgRepo.findBySlug.mockResolvedValue(mockOrg);

      await expect(service.create({ name: 'Test Org' })).rejects.toThrow(
        ConflictException,
      );
      expect(orgRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should delegate to the repository', async () => {
      orgRepo.findOne.mockResolvedValue(mockOrg);

      const result = await service.findOne('org-1');

      expect(result).toEqual(mockOrg);
      expect(orgRepo.findOne).toHaveBeenCalledWith('org-1');
    });
  });

  describe('findBySlug', () => {
    it('should delegate to the repository', async () => {
      orgRepo.findBySlug.mockResolvedValue(mockOrg);

      const result = await service.findBySlug('test-org');

      expect(result).toEqual(mockOrg);
      expect(orgRepo.findBySlug).toHaveBeenCalledWith('test-org');
    });
  });
});
