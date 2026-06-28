/**
 * Boards Module — `BoardType` enum (Step 1)
 *
 * Extracted from `entities/board.entity.ts` so the sealed barrel
 * (Step 4) can export the enum without leaking the TypeORM entity.
 * The entity now re-exports `BoardType` from this file to keep every
 * existing consumer (`dto/create-board.dto.ts`, `boards.service.ts`,
 * `gateways/board.gateway.ts`, etc.) binary-compatible — no import
 * site needs to change in Step 1.
 *
 * Convention mirrors `projects/enums/*` and `membership/enums/*`:
 * single-purpose enum files are first-class barrel citizens so the
 * public surface stays free of entity dependencies.
 */

export enum BoardType {
  KANBAN = 'kanban',
  SCRUM = 'scrum',
}
