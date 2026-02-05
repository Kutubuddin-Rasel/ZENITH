// src/attachments/services/virus-scanning.service.ts
import {
    Injectable,
    UnprocessableEntityException,
    ServiceUnavailableException,
    Logger,
    OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as NodeClam from 'clamscan';

/**
 * SECURITY: Virus Scanning Service (ClamAV Integration)
 * 
 * Scans uploaded files for malware before saving metadata.
 * Policy: FAIL CLOSED - If ClamAV is unreachable, reject the upload.
 * 
 * Infected files are:
 * 1. Immediately deleted from disk
 * 2. Logged as HIGH severity security event
 * 3. Rejected with UnprocessableEntityException
 */
@Injectable()
export class VirusScanningService implements OnModuleInit {
    private readonly logger = new Logger(VirusScanningService.name);
    private clamScan: NodeClam | null = null;
    private readonly isEnabled: boolean;
    private readonly clamavHost: string;
    private readonly clamavPort: number;

    constructor(private configService: ConfigService) {
        this.isEnabled = this.configService.get<string>('CLAMAV_ENABLED', 'false') === 'true';
        this.clamavHost = this.configService.get<string>('CLAMAV_HOST', 'localhost');
        this.clamavPort = this.configService.get<number>('CLAMAV_PORT', 3310);
    }

    async onModuleInit(): Promise<void> {
        if (!this.isEnabled) {
            this.logger.warn('ClamAV virus scanning is DISABLED. Set CLAMAV_ENABLED=true to enable.');
            return;
        }

        try {
            this.clamScan = await new NodeClam().init({
                removeInfected: false, // We handle deletion ourselves for logging
                quarantineInfected: false,
                scanLog: null,
                debugMode: false,
                clamdscan: {
                    host: this.clamavHost,
                    port: this.clamavPort,
                    timeout: 30000, // 30 second timeout for scans
                    localFallback: false,
                    active: true,
                },
                preference: 'clamdscan',
            });
            this.logger.log(`ClamAV connected: ${this.clamavHost}:${this.clamavPort}`);
        } catch (error) {
            this.logger.error(`Failed to connect to ClamAV: ${error.message}`);
            // Don't throw - service will use fail-closed policy at runtime
        }
    }

    /**
     * Scan a file for viruses/malware
     * 
     * @param filePath - Absolute path to file on disk
     * @param userId - User ID for security logging
     * @param userIp - User IP for security logging
     * @throws ServiceUnavailableException if ClamAV is unreachable (Fail Closed)
     * @throws UnprocessableEntityException if file is infected
     */
    async scanFile(
        filePath: string,
        userId?: string,
        userIp?: string,
    ): Promise<void> {
        // If scanning disabled, allow upload (but log warning)
        if (!this.isEnabled) {
            this.logger.debug('Virus scanning disabled - skipping scan');
            return;
        }

        // FAIL CLOSED: If scanner not initialized, reject upload
        if (!this.clamScan) {
            this.logger.error('ClamAV not available - rejecting upload (Fail Closed policy)');
            throw new ServiceUnavailableException(
                'Virus scanning service is unavailable. Please try again later.',
            );
        }

        try {
            const { isInfected, viruses } = await this.clamScan.isInfected(filePath);

            if (isInfected) {
                const virusNames = viruses?.join(', ') || 'Unknown';

                // HIGH SEVERITY: Log security alert
                this.logger.error(
                    `🚨 MALWARE DETECTED | File: ${filePath} | Virus: ${virusNames} | ` +
                    `User: ${userId || 'unknown'} | IP: ${userIp || 'unknown'}`,
                );

                // Immediately delete infected file
                await this.deleteFileQuietly(filePath);

                throw new UnprocessableEntityException(
                    'File rejected: Malware detected. This incident has been logged.',
                );
            }

            this.logger.debug(`File scanned clean: ${filePath}`);
        } catch (error) {
            // Re-throw our exceptions
            if (
                error instanceof UnprocessableEntityException ||
                error instanceof ServiceUnavailableException
            ) {
                throw error;
            }

            // FAIL CLOSED: Any scanner error = reject upload
            this.logger.error(`Virus scan error: ${error.message}`);
            throw new ServiceUnavailableException(
                'Virus scanning failed. Please try again later.',
            );
        }
    }

    /**
     * Delete file silently (best effort cleanup)
     */
    private async deleteFileQuietly(filePath: string): Promise<void> {
        try {
            await fs.promises.unlink(filePath);
            this.logger.debug(`Deleted infected file: ${filePath}`);
        } catch {
            this.logger.warn(`Failed to delete infected file: ${filePath}`);
        }
    }
}
