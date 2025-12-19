import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from './entities/api-key.entity';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import * as bcrypt from 'bcrypt';
import { generateSecureToken, TokenPrefix } from '../common/utils/token.util';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey)
    private apiKeyRepo: Repository<ApiKey>,
  ) {}

  /**
   * Generate a new API key
   * Returns the plain key (only shown once) and the stored entity
   */
  async create(
    userId: string,
    dto: CreateApiKeyDto,
  ): Promise<{ key: string; apiKey: ApiKey }> {
    // Generate random key using centralized token utility
    const plainKey = generateSecureToken(TokenPrefix.API_KEY, 24);
    const keyPrefix = plainKey.substring(0, 12); // "zth_live_xxx"

    // Hash the key for storage
    const keyHash = await bcrypt.hash(plainKey, 10);

    // Create API key entity
    const apiKey = this.apiKeyRepo.create({
      name: dto.name,
      keyHash,
      keyPrefix,
      userId,
      projectId: dto.projectId,
      scopes: dto.scopes,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      isActive: true,
    });

    const saved = await this.apiKeyRepo.save(apiKey);

    return {
      key: plainKey, // Only returned once!
      apiKey: saved,
    };
  }

  /**
   * Validate an API key and return user context
   * Used by the ApiKeyGuard
   */
  async validateKey(plainKey: string): Promise<ApiKey | null> {
    if (!plainKey || !plainKey.startsWith('zth_live_')) {
      return null;
    }

    // Get the prefix to narrow down search
    const keyPrefix = plainKey.substring(0, 12);

    // Find all keys with this prefix
    const keys = await this.apiKeyRepo.find({
      where: { keyPrefix, isActive: true },
      relations: ['user', 'project'],
    });

    // Check each key's hash
    for (const key of keys) {
      const isMatch = await bcrypt.compare(plainKey, key.keyHash);
      if (isMatch) {
        // Check expiration
        if (key.expiresAt && new Date() > key.expiresAt) {
          return null;
        }

        // Update last used timestamp
        await this.apiKeyRepo.update(key.id, { lastUsedAt: new Date() });

        return key;
      }
    }

    return null;
  }

  /**
   * List all API keys for a user (without revealing the full key)
   */
  async findAll(userId: string): Promise<ApiKey[]> {
    return this.apiKeyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Revoke (delete) an API key
   */
  async revoke(id: string, userId: string): Promise<void> {
    const key = await this.apiKeyRepo.findOne({ where: { id, userId } });
    if (!key) {
      throw new NotFoundException('API key not found');
    }
    await this.apiKeyRepo.remove(key);
  }

  /**
   * Update API key metadata (name, scopes)
   */
  async update(
    id: string,
    userId: string,
    updates: { name?: string; scopes?: string[] },
  ): Promise<ApiKey> {
    const key = await this.apiKeyRepo.findOne({ where: { id, userId } });
    if (!key) {
      throw new NotFoundException('API key not found');
    }

    if (updates.name) key.name = updates.name;
    if (updates.scopes) key.scopes = updates.scopes;

    return this.apiKeyRepo.save(key);
  }
}
