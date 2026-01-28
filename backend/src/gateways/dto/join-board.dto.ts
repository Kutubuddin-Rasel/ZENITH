import { IsUUID } from 'class-validator';

/**
 * DTO for join-board WebSocket message.
 * Validates that boardId is a valid UUID to prevent injection.
 */
export class JoinBoardDto {
    @IsUUID('4', { message: 'boardId must be a valid UUID' })
    boardId: string;
}

/**
 * DTO for leave-board WebSocket message.
 */
export class LeaveBoardDto {
    @IsUUID('4', { message: 'boardId must be a valid UUID' })
    boardId: string;
}
