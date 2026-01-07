import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationService } from './integration.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Integration, IntegrationType, IntegrationStatus } from '../entities/integration.entity';
import { SyncLog, SyncStatus } from '../entities/sync-log.entity';
import { ExternalData } from '../entities/external-data.entity';
import { SearchIndex } from '../entities/search-index.entity';
import { EncryptionService } from '../../common/services/encryption.service';
import { RateLimitService } from './rate-limit.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('IntegrationService', () => {
    let service: IntegrationService;
    let integrationRepo: any;
    let syncLogRepo: any;
    let syncQueue: any;
    let encryptionService: any;
    let rateLimitService: any;

    const mockIntegration = {
        id: 'int-1',
        name: 'Test GitHub',
        type: IntegrationType.GITHUB,
        organizationId: 'org-1',
        isActive: true,
        authConfig: { accessToken: 'encrypted_token' },
        healthStatus: IntegrationStatus.PENDING,
    };

    beforeEach(async () => {
        const mockRepo = {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
        };

        const mockEncryptionService = {
            encrypt: jest.fn().mockReturnValue('encrypted_value'),
            decrypt: jest.fn().mockReturnValue('decrypted_value'),
        };

        const mockRateLimitService = {
            executeWithRetry: jest.fn(),
        };

        const mockQueue = {
            add: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                IntegrationService,
                { provide: getRepositoryToken(Integration), useValue: mockRepo },
                { provide: getRepositoryToken(SyncLog), useValue: mockRepo },
                { provide: getRepositoryToken(ExternalData), useValue: mockRepo },
                { provide: getRepositoryToken(SearchIndex), useValue: mockRepo },
                { provide: EncryptionService, useValue: mockEncryptionService },
                { provide: RateLimitService, useValue: mockRateLimitService },
                { provide: getQueueToken('integration-sync'), useValue: mockQueue },
            ],
        }).compile();

        service = module.get<IntegrationService>(IntegrationService);
        integrationRepo = module.get(getRepositoryToken(Integration));
        syncLogRepo = module.get(getRepositoryToken(SyncLog));
        syncQueue = module.get(getQueueToken('integration-sync'));
        encryptionService = module.get(EncryptionService);
        rateLimitService = module.get(RateLimitService);
    });

    describe('createIntegration', () => {
        it('should create integration and encrypt tokens', async () => {
            integrationRepo.create.mockReturnValue(mockIntegration);
            integrationRepo.save.mockResolvedValue(mockIntegration);

            const dto = {
                name: 'GitHub',
                type: IntegrationType.GITHUB,
                organizationId: 'org-1',
                config: {},
                authConfig: { accessToken: 'raw_token' },
            };

            const result = await service.createIntegration(dto as any);

            expect(encryptionService.encrypt).toHaveBeenCalledWith('raw_token');
            expect(result).toEqual(mockIntegration);
            expect(integrationRepo.save).toHaveBeenCalled();
        });
    });

    describe('syncIntegration', () => {
        it('should queue sync job', async () => {
            integrationRepo.findOne.mockResolvedValue(mockIntegration);
            syncLogRepo.create.mockReturnValue({ id: 'log-1', status: SyncStatus.QUEUED });
            syncLogRepo.save.mockResolvedValue({});

            await service.syncIntegration('int-1', 'org-1');

            expect(syncQueue.add).toHaveBeenCalledWith(
                'sync-job',
                expect.objectContaining({ integrationId: 'int-1' }),
                expect.any(Object)
            );
        });
    });

    describe('testConnection', () => {
        it('should test connection successfully', async () => {
            // Mock decrypt to return token
            encryptionService.decrypt.mockReturnValue('valid_token');

            // Mock specific integration test logic (e.g. GitHub)
            // The service calls this.testGitHubConnection which calls fetch
            // Since we can't easily mock fetch globally here without setup, 
            // we rely on RateLimitService.executeWithRetry mock.

            // Wait: The service passes an async function to executeWithRetry.
            // We need executeWithRetry to execute that function.
            rateLimitService.executeWithRetry.mockImplementation(async (fn: () => Promise<any>) => {
                return fn();
            });

            // Now we need to mock global fetch
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ ok: true }),
            } as any);

            const result = await service.testConnection(mockIntegration as any);
            expect(result).toBe(true);
        });

        it('should fail if no access token', async () => {
            const noTokenIntegration = { ...mockIntegration, authConfig: {} }; // No token
            const result = await service.testConnection(noTokenIntegration as any);
            expect(result).toBe(false);
        });
    });
});
