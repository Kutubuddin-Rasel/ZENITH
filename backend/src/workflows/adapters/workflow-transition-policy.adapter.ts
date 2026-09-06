import { Injectable } from '@nestjs/common';

// Sealed-barrel consumption: the port + DTO come from `issues/index.ts`.
import { WorkflowTransitionPolicyPort, TransitionDecision } from '../../issues';
import { Issue } from '../../issues/entities/issue.entity';
import { WorkflowTransitionsService } from '../services/workflow-transitions.service';

/**
 * WorkflowTransitionPolicyAdapter — capability-owner side of the issues →
 * workflows transition-policy inversion.
 *
 * Implements the issues-owned `WorkflowTransitionPolicyPort` by delegating to
 * `WorkflowTransitionsService.isTransitionAllowed` and projecting the
 * `TransitionCheckResult` down to the `{ allowed, reason, transitionName }`
 * slice issues reads (dropping the worker-only `requiresComment`). The
 * issues-owned `Issue` entity is forwarded unchanged so the engine can
 * evaluate per-transition conditions.
 */
@Injectable()
export class WorkflowTransitionPolicyAdapter extends WorkflowTransitionPolicyPort {
  constructor(private readonly transitions: WorkflowTransitionsService) {
    super();
  }

  async isTransitionAllowed(
    projectId: string,
    currentStatusName: string,
    targetStatusName: string,
    userRole: string,
    issue?: Issue,
  ): Promise<TransitionDecision> {
    const result = await this.transitions.isTransitionAllowed(
      projectId,
      currentStatusName,
      targetStatusName,
      userRole,
      issue,
    );
    return {
      allowed: result.allowed,
      reason: result.reason,
      transitionName: result.transitionName,
    };
  }
}
