import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from './entities/api-key.entity';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { AuditService } from '../audit/services/audit.service';
import {
  AuditEventType,
  AuditSeverity,
} from '../audit/entities/audit-log.entity';
import * as bcrypt from 'bcrypt';
import { generateSecureToken, TokenPrefix } from '../common/utils/token.util';

// =============================================================================
// ACTOR CONTEXT (For PCI-DSS Compliant Audit Logging)
// =============================================================================

export interface ActorContext {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

interface SanitizedKeyMetadata {
  keyId: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  projectId?: string;
  expiresAt?: Date;
}

// =============================================================================
// SERVICE
// =============================================================================

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);
  private readonly DEFAULT_ROTATION_GRACE_HOURS = 24;

  constructor(
    @InjectRepository(ApiKey)
    private apiKeyRepo: Repository<ApiKey>,
    private auditService: AuditService,
  ) {}

  // ===========================================================================
  // CREATE
  // ===========================================================================

  async create(
    actor: ActorContext,
    dto: CreateApiKeyDto,
  ): Promise<{ key: string; apiKey: ApiKey }> {
    const plainKey = generateSecureToken(TokenPrefix.API_KEY, 24);
    const keyPrefix = plainKey.substring(0, 12);
    const keyHash = await bcrypt.hash(plainKey, 10);

    const apiKey = this.apiKeyRepo.create({
      name: dto.name,
      keyHash,
      keyPrefix,
      userId: actor.userId,
      projectId: dto.projectId,
      scopes: dto.scopes,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      isActive: true,
    });

    const saved = await this.apiKeyRepo.save(apiKey);

    await this.logAuditEvent(
      AuditEventType.API_KEY_CREATED,
      AuditSeverity.HIGH,
      'API key created',
      actor,
      {
        keyId: saved.id,
        keyPrefix: saved.keyPrefix,
        name: saved.name,
        scopes: saved.scopes,
        projectId: saved.projectId,
        expiresAt: saved.expiresAt,
      },
    );

    this.logger.log(
      `API key created: ${saved.keyPrefix}... by user ${actor.userId}`,
    );

    return { key: plainKey, apiKey: saved };
  }

  // ===========================================================================
  // REVOKE
  // ===========================================================================

  async revoke(
    actor: ActorContext,
    id: string,
    reason?: string,
  ): Promise<void> {
    const key = await this.apiKeyRepo.findOne({
      where: { id, userId: actor.userId },
    });

    if (!key) {
      throw new NotFoundException('API key not found');
    }

    const sanitizedMetadata: SanitizedKeyMetadata = {
      keyId: key.id,
      keyPrefix: key.keyPrefix,
      name: key.name,
      scopes: key.scopes,
      projectId: key.projectId || undefined,
      expiresAt: key.expiresAt || undefined,
    };

    await this.apiKeyRepo.remove(key);

    await this.logAuditEvent(
      AuditEventType.API_KEY_REVOKED,
      AuditSeverity.HIGH,
      reason ? `API key revoked: ${reason}` : 'API key revoked',
      actor,
      { ...sanitizedMetadata, reason: reason || 'No reason provided' },
    );

    this.logger.log(`API key revoked: ${key.keyPrefix}... by ${actor.userId}`);
  }

  // ===========================================================================
  // UPDATE
  // ===========================================================================

  async update(
    actor: ActorContext,
    id: string,
    updates: { name?: string; scopes?: string[] },
  ): Promise<ApiKey> {
    const key = await this.apiKeyRepo.findOne({
      where: { id, userId: actor.userId },
    });

    if (!key) {
      throw new NotFoundException('API key not found');
    }

    const changes: Array<{
      field: string;
      oldValue: unknown;
      newValue: unknown;
    }> = [];

    if (updates.name && updates.name !== key.name) {
      changes.push({
        field: 'name',
        oldValue: key.name,
        newValue: updates.name,
      });
      key.name = updates.name;
    }

    if (
      updates.scopes &&
      JSON.stringify(updates.scopes) !== JSON.stringify(key.scopes)
    ) {
      changes.push({
        field: 'scopes',
        oldValue: key.scopes,
        newValue: updates.scopes,
      });
      key.scopes = updates.scopes;
    }

    if (changes.length === 0) {
      return key;
    }

    const saved = await this.apiKeyRepo.save(key);

    await this.logAuditEvent(
      AuditEventType.API_KEY_UPDATED,
      AuditSeverity.MEDIUM,
      `API key updated: ${changes.map((c) => c.field).join(', ')}`,
      actor,
      { keyId: saved.id, keyPrefix: saved.keyPrefix, changes },
    );

    this.logger.log(
      `API key updated: ${saved.keyPrefix}... by ${actor.userId}`,
    );

    return saved;
  }

  // ===========================================================================
  // ROTATE (Zero-Downtime Key Migration)
  // ===========================================================================

  async rotateKey(
    actor: ActorContext,
    id: string,
    gracePeriodHours?: number,
  ): Promise<{
    newKey: { key: string; id: string; keyPrefix: string; name: string };
    oldKeyRevocation: {
      keyId: string;
      keyPrefix: string;
      revokedAt: Date;
      gracePeriodHours: number;
    };
    message: string;
  }> {
    const gracePeriod = gracePeriodHours ?? this.DEFAULT_ROTATION_GRACE_HOURS;

    // Step 1: Fetch and verify old key
    const oldKey = await this.apiKeyRepo.findOne({
      where: { id, userId: actor.userId, isActive: true },
    });

    if (!oldKey) {
      throw new NotFoundException('API key not found or not active');
    }

    // Prevent rotating an already-rotated key
    if (oldKey.revokeAt) {
      throw new BadRequestException(
        'This key has already been rotated. Use the new key instead.',
      );
    }

    // Step 2: Generate new key secret
    const plainKey = generateSecureToken(TokenPrefix.API_KEY, 24);
    const keyPrefix = plainKey.substring(0, 12);
    const keyHash = await bcrypt.hash(plainKey, 10);

    // Step 3: Calculate revocation time
    const revokeAt = new Date(Date.now() + gracePeriod * 60 * 60 * 1000);

    // Step 4: Clone attributes (WHITELIST approach)
    const newKey = this.apiKeyRepo.create({
      name: oldKey.name,
      scopes: [...oldKey.scopes],
      projectId: oldKey.projectId,
      rateLimit: oldKey.rateLimit, // CRITICAL!
      allowedIps: oldKey.allowedIps ? [...oldKey.allowedIps] : null,
      userId: oldKey.userId,
      expiresAt: oldKey.expiresAt,
      keyHash,
      keyPrefix,
      isActive: true,
    });

    // Step 5: Save new key
    const savedNewKey = await this.apiKeyRepo.save(newKey);

    // Step 6: Update old key with revocation schedule
    oldKey.revokeAt = revokeAt;
    oldKey.rotatedToKeyId = savedNewKey.id;
    await this.apiKeyRepo.save(oldKey);

    // Step 7: Audit log
    await this.logAuditEvent(
      AuditEventType.API_KEY_ROTATED,
      AuditSeverity.HIGH,
      `API key rotated: ${oldKey.keyPrefix}... → ${savedNewKey.keyPrefix}...`,
      actor,
      {
        oldKeyId: oldKey.id,
        oldKeyPrefix: oldKey.keyPrefix,
        newKeyId: savedNewKey.id,
        newKeyPrefix: savedNewKey.keyPrefix,
        gracePeriodHours: gracePeriod,
        revokeAt: revokeAt.toISOString(),
      },
    );

    this.logger.log(
      `API key rotated: ${oldKey.keyPrefix}... → ${savedNewKey.keyPrefix}... by ${actor.userId}`,
    );

    return {
      newKey: {
        key: plainKey,
        id: savedNewKey.id,
        keyPrefix: savedNewKey.keyPrefix,
        name: savedNewKey.name,
      },
      oldKeyRevocation: {
        keyId: oldKey.id,
        keyPrefix: oldKey.keyPrefix,
        revokedAt: revokeAt,
        gracePeriodHours: gracePeriod,
      },
      message: `Key rotated successfully. Old key will be revoked in ${gracePeriod} hours.`,
    };
  }

  // ===========================================================================
  // VALIDATE
  // ===========================================================================

  async validateKey(
    plainKey: string,
    requestContext?: { ipAddress?: string; userAgent?: string },
  ): Promise<ApiKey | null> {
    if (!plainKey || !plainKey.startsWith('zth_live_')) {
      return null;
    }

    const keyPrefix = plainKey.substring(0, 12);

    const keys = await this.apiKeyRepo.find({
      where: { keyPrefix, isActive: true },
      relations: ['user', 'project'],
    });

    for (const key of keys) {
      const isMatch = await bcrypt.compare(plainKey, key.keyHash);
      if (isMatch) {
        // Check expiration
        if (key.expiresAt && new Date() > key.expiresAt) {
          this.auditService
            .log({
              eventType: AuditEventType.API_KEY_EXPIRED,
              severity: AuditSeverity.MEDIUM,
              description: 'Attempted use of expired API key',
              resourceType: 'api_key',
              resourceId: key.id,
              ipAddress: requestContext?.ipAddress,
              userAgent: requestContext?.userAgent,
              details: {
                keyPrefix: key.keyPrefix,
                expiredAt: key.expiresAt.toISOString(),
              },
            })
            .catch((err) => this.logger.warn(`Audit log failed: ${err}`));
          return null;
        }

        // Check rotation revocation (grace period expired)
        if (key.revokeAt && new Date() > key.revokeAt) {
          this.auditService
            .log({
              eventType: AuditEventType.API_KEY_EXPIRED,
              severity: AuditSeverity.MEDIUM,
              description: 'Attempted use of rotated API key past grace period',
              resourceType: 'api_key',
              resourceId: key.id,
              ipAddress: requestContext?.ipAddress,
              userAgent: requestContext?.userAgent,
              details: {
                keyPrefix: key.keyPrefix,
                revokedAt: key.revokeAt.toISOString(),
                rotatedToKeyId: key.rotatedToKeyId,
              },
            })
            .catch((err) => this.logger.warn(`Audit log failed: ${err}`));
          return null;
        }

        // Update last used
        this.apiKeyRepo
          .update(key.id, { lastUsedAt: new Date() })
          .catch(() => {});
        return key;
      }
    }

    // Log failed validation
    if (requestContext) {
      this.auditService
        .log({
          eventType: AuditEventType.API_KEY_VALIDATION_FAILED,
          severity: AuditSeverity.MEDIUM,
          description: 'API key validation failed',
          resourceType: 'api_key',
          ipAddress: requestContext.ipAddress,
          userAgent: requestContext.userAgent,
          details: { keyPrefix, reason: 'No matching key found' },
        })
        .catch((err) => this.logger.warn(`Audit log failed: ${err}`));
    }

    return null;
  }

  // ===========================================================================
  // READ OPERATIONS
  // ===========================================================================

  async findAll(userId: string): Promise<ApiKey[]> {
    return this.apiKeyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<ApiKey | null> {
    return this.apiKeyRepo.findOne({ where: { id, userId } });
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private async logAuditEvent(
    eventType: AuditEventType,
    severity: AuditSeverity,
    description: string,
    actor: ActorContext,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.auditService.log({
        eventType,
        severity,
        description,
        userId: actor.userId,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        sessionId: actor.sessionId,
        resourceType: 'api_key',
        resourceId: (metadata.keyId as string) || undefined,
        details: this.sanitizeMetadata(metadata),
      });
    } catch (error) {
      this.logger.error(`CRITICAL: Audit log failed for ${eventType}`, error);
    }
  }

  private sanitizeMetadata(
    metadata: Record<string, unknown>,
  ): Record<string, unknown> {
    const sensitiveKeys = [
      'plainKey',
      'key',
      'secret',
      'apiSecret',
      'keyHash',
      'hash',
      'password',
      'token',
    ];
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (
        sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))
      ) {
        sanitized[key] = '[REDACTED]';
      } else if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !(value instanceof Date)
      ) {
        sanitized[key] = this.sanitizeMetadata(
          value as Record<string, unknown>,
        );
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
