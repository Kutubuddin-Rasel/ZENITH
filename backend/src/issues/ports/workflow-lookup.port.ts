/**
 * Issues Module — Outbound Ports: WorkflowStatusLookupPort + WorkflowTransitionPolicyPort
 *
 * Issues consumes TWO distinct workflow capabilities, today via the concrete
 * `WorkflowStatusesService` and `WorkflowTransitionsService`:
 *   - status resolution (`findById` / `getDefaultStatus` /
 *     `findByProjectAndName`) during create / update / move, and
 *   - transition-policy enforcement (`isTransitionAllowed`) during status
 *     changes.
 *
 * Note the transition port deliberately accepts the issues-owned `Issue`
 * entity — that is NOT a boundary violation (issues owns `Issue`), and the
 * workflows transition engine needs it to evaluate per-transition conditions
 * (required fields, minimum story points).
 *
 * Two collaborators ⇒ two ports (ISP): a consumer that only resolves statuses
 * must not depend on the transition-policy surface, and vice-versa. This is a
 * richer mirror of boards' single-method `WorkflowLookupPort` (which only
 * needed `findStatus`).
 *
 * Inversion strategy: issues owns both contracts; the non-global
 * `WorkflowsModule` (already imported by `issues.module`) binds both adapters
 * and re-exports the tokens — the exact pattern it already uses for boards'
 * `WorkflowLookupPort`.
 */

import type { Issue } from '../entities/issue.entity';

/**
 * Slim projection of a `WorkflowStatus` row — the three fields the issues
 * create/update/move paths read (`id`, `name`, and `projectId` for the
 * project-ownership guard). Excludes category, color, ordering, etc.
 */
export interface WorkflowStatusInfo {
  readonly id: string;
  readonly name: string;
  readonly projectId: string;
}

export abstract class WorkflowStatusLookupPort {
  /** Resolve a status by id (project-agnostic); `null` when none. */
  abstract findById(statusId: string): Promise<WorkflowStatusInfo | null>;

  /** The project's configured default/initial status, or `null`. */
  abstract getDefaultStatus(
    projectId: string,
  ): Promise<WorkflowStatusInfo | null>;

  /** Resolve a status by `(projectId, name)` — the `'Backlog'` fallback. */
  abstract findByProjectAndName(
    projectId: string,
    name: string,
  ): Promise<WorkflowStatusInfo | null>;
}

/**
 * Result of a transition-policy check — the narrow slice issues reads from the
 * workflows `TransitionCheckResult` (`allowed` gate + a `reason` for the 403 +
 * the resolved `transitionName` for the emitted event).
 */
export interface TransitionDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly transitionName?: string;
}

export abstract class WorkflowTransitionPolicyPort {
  /**
   * Decide whether moving from `currentStatusName` → `targetStatusName` is
   * permitted for `userRole` in `projectId`. `currentStatusName` carries the
   * issue's present status string so name-based legacy workflows resolve;
   * `issue` (optional) lets the engine evaluate per-transition conditions
   * (required fields, minimum story points).
   */
  abstract isTransitionAllowed(
    projectId: string,
    currentStatusName: string,
    targetStatusName: string,
    userRole: string,
    issue?: Issue,
  ): Promise<TransitionDecision>;
}
