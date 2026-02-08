// src/notifications/dto/update-notification-status.dto.ts
import { IsEnum, IsNotEmpty } from 'class-validator';
import { NotificationStatus } from '../entities/notification.entity';

/**
 * UpdateNotificationStatusDto
 *
 * SECURITY (Phase 3): Strict validation for status updates
 * - @IsEnum: Enforces valid lifecycle states only
 * - Prevents state corruption from arbitrary strings
 */
export class UpdateNotificationStatusDto {
    @IsNotEmpty()
    @IsEnum(NotificationStatus, {
        message: `status must be one of: ${Object.values(NotificationStatus).join(', ')}`,
    })
    status: NotificationStatus;
}
