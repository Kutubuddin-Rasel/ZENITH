import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLog, AuditEventType } from '../entities/audit-log.entity';
import { User } from '../../users/entities/user.entity';
import { LessThan } from 'typeorm';

describe('AuditService', () => {
    let service: AuditService;
    let auditRepo: any;
    let userRepo: any;

    const mockLog = {
        id: 'log-1',
        eventType: AuditEventType.LOGIN_SUCCESS,
        timestamp: new Date(),
        expiresAt: new Date(),
    };

    beforeEach(async () => {
        const mockRepo = {
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
                andWhere: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                offset: jest.fn().mockReturnThis(),
                getManyAndCount: jest.fn().mockResolvedValue([[mockLog], 1]),
                getMany: jest.fn().mockResolvedValue([mockLog]),
            })),
            delete: jest.fn(),
            update: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuditService,
                { provide: getRepositoryToken(AuditLog), useValue: mockRepo },
                { provide: getRepositoryToken(User), useValue: mockRepo },
            ],
        }).compile();

        service = module.get<AuditService>(AuditService);
        auditRepo = module.get(getRepositoryToken(AuditLog));
        userRepo = module.get(getRepositoryToken(User));
    });

    describe('log', () => {
        it('should save audit log with expiration', async () => {
            auditRepo.save.mockResolvedValue(mockLog);

            await service.log({
                eventType: AuditEventType.LOGIN_SUCCESS,
                description: 'Login',
                userEmail: 'test@example.com'
            });

            expect(auditRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: AuditEventType.LOGIN_SUCCESS,
                    expiresAt: expect.any(Date),
                })
            );
        });
    });

    describe('getAuditLogs', () => {
        it('should filter logs', async () => {
            const result = await service.getAuditLogs({
                userIds: ['u1'],
                eventTypes: [AuditEventType.LOGIN_SUCCESS]
            });

            expect(result.logs).toContain(mockLog);
            expect(result.total).toBe(1);
        });
    });

    describe('cleanupExpiredLogs', () => {
        it('should delete expired logs', async () => {
            auditRepo.delete.mockResolvedValue({ affected: 5 });
            const count = await service.cleanupExpiredLogs();
            expect(count).toBe(5);
            expect(auditRepo.delete).toHaveBeenCalledWith({
                expiresAt: expect.any(Object), // LessThan match
            });
        });
    });
});
