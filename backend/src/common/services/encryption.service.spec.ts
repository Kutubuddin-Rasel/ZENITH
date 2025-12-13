import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'ENCRYPTION_KEY') {
        return '12345678901234567890123456789012'; // 32 chars
      }
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encrypt', () => {
    it('should encrypt a string', () => {
      const text = 'hello world';
      const encrypted = service.encrypt(text);
      expect(encrypted).not.toBe(text);
      expect(encrypted).toContain(':'); // IV:Content format
    });

    it('should produce different outputs for same input (random IV)', () => {
      const text = 'hello world';
      const encrypted1 = service.encrypt(text);
      const encrypted2 = service.encrypt(text);
      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('decrypt', () => {
    it('should decrypt an encrypted string', () => {
      const text = 'hello world';
      const encrypted = service.encrypt(text);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(text);
    });

    it('should throw error for invalid format', () => {
      expect(() => service.decrypt('invalid-format')).toThrow();
    });

    it('should throw error for corrupted data', () => {
      const text = 'hello world';
      const encrypted = service.encrypt(text);
      const parts = encrypted.split(':');
      const corrupted = `${parts[0]}:invaliddata`;
      expect(() => service.decrypt(corrupted)).toThrow();
    });
  });
});
