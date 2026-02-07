import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Worker } from 'worker_threads';
import * as path from 'path';
import * as jsonLogic from 'json-logic-js';
import { Workflow, WorkflowDefinition } from '../entities/workflow.entity';
import {
  WorkflowExecution,
  ExecutionStatus,
  ExecutionContext,
  ExecutionLog,
} from '../entities/workflow-execution.entity';
import { WorkflowNode, WorkflowConnection } from '../entities/workflow.entity';

/**
 * JsonLogicRule - Type-safe representation of a JSON Logic rule
 *
 * SECURITY: This replaces arbitrary JavaScript string evaluation
 * with a safe, declarative logic engine that cannot execute code.
 */
export type JsonLogicRule = Record<string, unknown> | boolean;

/**
 * Worker output interface
 */
interface WorkerOutput {
  success: boolean;
  result?: Record<string, unknown>;
  logs?: ExecutionLog[];
  error?: string;
}

/**
 * Workflow execution timeout exception
 */
export class WorkflowTimeoutException extends Error {
  constructor(workflowId: string, timeoutMs: number) {
    super(`Workflow ${workflowId} execution timed out after ${timeoutMs}ms`);
    this.name = 'WorkflowTimeoutException';
  }
}

/**
 * Default execution timeout in milliseconds
 * SECURITY: Prevents runaway workflows from blocking resources
 */
const DEFAULT_EXECUTION_TIMEOUT_MS = 5000;

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name);
  private readonly workerPath: string;

  constructor(
    @InjectRepository(Workflow)
    private workflowRepo: Repository<Workflow>,
    @InjectRepository(WorkflowExecution)
    private executionRepo: Repository<WorkflowExecution>,
  ) {
    // Resolve worker path relative to this file
    this.workerPath = path.join(__dirname, '..', 'workers', 'workflow.worker.js');
  }

  /**
   * Execute workflow in isolated Worker Thread
   *
   * SECURITY (Phase 6): Offloads CPU-intensive work to prevent Event Loop blocking
   * SAFETY: Worker can be forcefully terminated on timeout
   */
  private executeInWorker(
    definition: WorkflowDefinition,
    context: ExecutionContext,
    timeoutMs: number = DEFAULT_EXECUTION_TIMEOUT_MS,
  ): Promise<WorkerOutput> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerPath, {
        workerData: { definition, context },
      });

      // Kill switch: terminate worker on timeout
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new WorkflowTimeoutException('unknown', timeoutMs));
      }, timeoutMs);

      worker.on('message', (output: WorkerOutput) => {
        clearTimeout(timeout);
        resolve(output);
      });

      worker.on('error', (error) => {
        clearTimeout(timeout);
        this.logger.error(`Worker error: ${error.message}`, error.stack);
        reject(error);
      });

      worker.on('exit', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  }

  async executeWorkflow(
    workflowId: string,
    context: ExecutionContext,
  ): Promise<WorkflowExecution> {
    const workflow = await this.workflowRepo.findOne({
      where: { id: workflowId, isActive: true },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found or inactive');
    }

    // Create execution record
    const execution = this.executionRepo.create({
      workflowId,
      triggerEvent: context.triggerEvent,
      context,
      status: ExecutionStatus.RUNNING,
    });

    const savedExecution = await this.executionRepo.save(execution);

    try {
      // Execute workflow
      const result = await this.runWorkflow(
        workflow,
        context,
        savedExecution.id,
      );

      // Update execution with result
      await this.executionRepo.update(savedExecution.id, {
        status: ExecutionStatus.COMPLETED,
        completedAt: new Date(),
        result: result as Record<string, any>,
        executionTime: Date.now() - savedExecution.startedAt.getTime(),
      });

      // Update workflow statistics
      await this.updateWorkflowStats(workflowId);

      const execution = await this.executionRepo.findOne({
        where: { id: savedExecution.id },
      });
      if (!execution) {
        throw new Error('Failed to retrieve saved execution');
      }
      return execution;
    } catch (error) {
      this.logger.error(
        `Workflow execution failed: ${(error as Error).message}`,
        (error as Error).stack,
      );

      await this.executionRepo.update(savedExecution.id, {
        status: ExecutionStatus.FAILED,
        completedAt: new Date(),
        errorMessage: (error as Error).message,
        executionTime: Date.now() - savedExecution.startedAt.getTime(),
      });

      throw error;
    }
  }

  private async runWorkflow(
    workflow: Workflow,
    context: ExecutionContext,
    executionId: string,
  ): Promise<Record<string, unknown>> {
    // Get timeout from workflow settings or use default
    const timeoutMs = workflow.definition.settings?.maxExecutionTime
      ? workflow.definition.settings.maxExecutionTime * 1000
      : DEFAULT_EXECUTION_TIMEOUT_MS;

    this.logger.log(
      `Executing workflow ${workflow.id} in Worker Thread (timeout: ${timeoutMs}ms)`,
    );

    // Execute in isolated worker thread
    const output = await this.executeInWorker(
      workflow.definition,
      context,
      timeoutMs,
    );

    // Update execution log
    if (output.logs) {
      await this.executionRepo.update(executionId, {
        executionLog: output.logs as unknown as Record<string, unknown>[],
      });
    }

    if (!output.success) {
      throw new Error(output.error || 'Workflow execution failed');
    }

    return output.result || {};
  }

  /**
   * Legacy direct execution (kept for fallback/testing)
   * @deprecated Use runWorkflow with Worker Thread instead
   */
  private async runWorkflowDirect(
    workflow: Workflow,
    context: ExecutionContext,
    executionId: string,
  ): Promise<Record<string, unknown>> {
    const { nodes, connections } = workflow.definition;
    const visitedNodes = new Set<string>();
    const executionLog: ExecutionLog[] = [];
    const result: Record<string, unknown> = {};

    // Find start node
    const startNode = nodes.find((node) => node.type === 'start');
    if (!startNode) {
      throw new Error('Workflow must have a start node');
    }

    // Execute workflow
    await this.executeNode(startNode, context, executionLog, result);
    visitedNodes.add(startNode.id);

    // Process connections and execute connected nodes
    await this.processConnections(
      startNode.id,
      connections,
      nodes,
      context,
      visitedNodes,
      executionLog,
      result,
    );

    // Update execution log
    await this.executionRepo.update(executionId, {
      executionLog: executionLog as unknown as Record<string, unknown>[],
    });

    return result;
  }

  private async processConnections(
    currentNodeId: string,
    connections: WorkflowConnection[],
    nodes: WorkflowNode[],
    context: ExecutionContext,
    visitedNodes: Set<string>,
    executionLog: ExecutionLog[],
    result: Record<string, unknown>,
  ): Promise<void> {
    await Promise.resolve();
    const outgoingConnections = connections.filter(
      (conn) => conn.source === currentNodeId,
    );

    for (const connection of outgoingConnections) {
      const targetNode = nodes.find((node) => node.id === connection.target);
      if (!targetNode || visitedNodes.has(targetNode.id)) {
        continue;
      }

      // Check condition if exists
      if (
        connection.condition &&
        !this.evaluateCondition(connection.condition, context)
      ) {
        continue;
      }

      // Execute target node
      await this.executeNode(targetNode, context, executionLog, result);
      visitedNodes.add(targetNode.id);

      // Recursively process connections from this node
      await this.processConnections(
        targetNode.id,
        connections,
        nodes,
        context,
        visitedNodes,
        executionLog,
        result,
      );
    }
  }

  private async executeNode(
    node: WorkflowNode,
    context: ExecutionContext,
    executionLog: ExecutionLog[],
    result: Record<string, unknown>,
  ): Promise<void> {
    await Promise.resolve();
    this.logger.log(`Starting execution for node ${node.id}`);
    const logEntry: ExecutionLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level: 'info',
      message: `Executing node: ${node.name}`,
      nodeId: node.id,
    };

    try {
      switch (node.type) {
        case 'start':
          await this.executeStartNode(node, context, result);
          break;
        case 'end':
          await this.executeEndNode(node, context, result);
          break;
        case 'status':
          await this.executeStatusNode(node, context, result);
          break;
        case 'decision':
          await this.executeDecisionNode(node, context, result);
          break;
        case 'action':
          await this.executeActionNode(node, context, result);
          break;
        case 'approval':
          await this.executeApprovalNode(node, context, result);
          break;
        case 'parallel':
          await this.executeParallelNode(node, context, result);
          break;
        case 'merge':
          await this.executeMergeNode(node, context, result);
          break;
        default:
          throw new Error(
            `Unknown node type: ${(node as { type: string }).type}`,
          );
      }

      logEntry.level = 'info';
      logEntry.message = `Node executed successfully: ${node.name}`;
    } catch (error) {
      logEntry.level = 'error';
      logEntry.message = `Node execution failed: ${(error as Error).message}`;
      logEntry.data = {
        error: (error as Error).message,
        stack: (error as Error).stack,
      };
      throw error;
    } finally {
      executionLog.push(logEntry);
      this.logger.log(`Ending execution for node ${node.id}`);
    }
  }

  private async executeStartNode(
    node: WorkflowNode,
    context: ExecutionContext,
    result: Record<string, unknown>,
  ): Promise<void> {
    await Promise.resolve();
    result.workflowStarted = true;
    result.startTime = new Date().toISOString();
  }

  private async executeEndNode(
    node: WorkflowNode,
    context: ExecutionContext,
    result: Record<string, unknown>,
  ): Promise<void> {
    await Promise.resolve();
    result.workflowCompleted = true;
    result.endTime = new Date().toISOString();
  }

  private async executeStatusNode(
    node: WorkflowNode,
    context: ExecutionContext,
    result: Record<string, unknown>,
  ): Promise<void> {
    await Promise.resolve();
    const { status } = node.config;
    if (status && context.issueId) {
      // Update issue status
      result.statusUpdated = true;
      result.newStatus = status;
    }
  }

  private async executeDecisionNode(
    node: WorkflowNode,
    context: ExecutionContext,
    result: Record<string, unknown>,
  ): Promise<void> {
    await Promise.resolve();
    const { condition } = node.config as { condition: string };
    if (condition) {
      result.decisionResult = this.evaluateCondition(condition, context);
    }
  }

  private async executeActionNode(
    node: WorkflowNode,
    context: ExecutionContext,
    result: Record<string, unknown>,
  ): Promise<void> {
    await Promise.resolve();
    const { action, config } = node.config;

    switch (action) {
      case 'send_notification':
        result.notificationSent = true;
        result.notificationConfig = config;
        break;
      case 'assign_user':
        result.userAssigned = true;
        result.assignee = (config as { userId: string }).userId;
        break;
      case 'update_field':
        result.fieldUpdated = true;
        result.field = (config as { field: string }).field;
        result.value = (config as { value: unknown }).value;
        break;
      default:
        result.actionExecuted = true;
        result.action = action;
    }
  }

  private async executeApprovalNode(
    node: WorkflowNode,
    context: ExecutionContext,
    result: Record<string, unknown>,
  ): Promise<void> {
    await Promise.resolve();
    const { approvers, autoApprove } = node.config;
    result.approvalRequired = true;
    result.approvers = approvers;
    result.autoApprove = autoApprove;
  }

  private async executeParallelNode(
    node: WorkflowNode,
    context: ExecutionContext,
    result: Record<string, unknown>,
  ): Promise<void> {
    await Promise.resolve();
    this.logger.log(`Executing parallel branches for node ${node.id}`);
    result.parallelExecution = true;
    result.parallelBranches = node.config.branches || [];
  }

  private async executeMergeNode(
    node: WorkflowNode,
    context: ExecutionContext,
    result: Record<string, unknown>,
  ): Promise<void> {
    await Promise.resolve();
    result.mergeCompleted = true;
    result.mergedData = node.config.mergeStrategy || 'all';
  }

  /**
   * Evaluate a workflow condition using JSON Logic
   *
   * SECURITY FIX (Phase 1): Replaced new Function() RCE vulnerability
   * with safe declarative json-logic-js evaluation.
   *
   * JSON Logic cannot:
   * - Execute arbitrary JavaScript
   * - Access Node.js APIs (process, require, fs)
   * - Perform system calls
   *
   * @param condition - JsonLogicRule object (NOT a JavaScript string)
   * @param context - Execution context data
   * @returns boolean result of condition evaluation
   */
  private evaluateCondition(
    condition: JsonLogicRule | string,
    context: ExecutionContext,
  ): boolean {
    try {
      // SECURITY: Handle legacy string conditions by rejecting them
      if (typeof condition === 'string') {
        this.logger.warn(
          `Legacy string condition detected. Rejecting for security: ${condition.substring(0, 50)}...`,
        );
        // For backward compatibility during migration, attempt to parse as JSON
        try {
          condition = JSON.parse(condition) as JsonLogicRule;
        } catch {
          // Cannot parse as JSON, reject the condition
          this.logger.error('String condition cannot be parsed as JSON Logic. Returning false.');
          return false;
        }
      }

      // SECURITY: Use json-logic-js for safe evaluation
      const result = jsonLogic.apply(condition, context as unknown as Record<string, unknown>);

      // Ensure boolean return
      return Boolean(result);
    } catch (error) {
      this.logger.warn(
        `Failed to evaluate JSON Logic condition: ${JSON.stringify(condition)}`,
        error,
      );
      return false;
    }
  }

  private async updateWorkflowStats(workflowId: string): Promise<void> {
    const stats = (await this.executionRepo
      .createQueryBuilder('execution')
      .select('COUNT(*)', 'total')
      .addSelect('AVG(execution.executionTime)', 'avgTime')
      .addSelect(
        'SUM(CASE WHEN execution.status = :status THEN 1 ELSE 0 END)',
        'successful',
      )
      .where('execution.workflowId = :workflowId', { workflowId })
      .setParameter('status', ExecutionStatus.COMPLETED)
      .getRawOne()) as { total: string; successful: string; avgTime: string };

    const total = parseInt(stats.total, 10);
    const successful = parseInt(stats.successful, 10);
    const avgTime = parseFloat(stats.avgTime || '0');

    const successRate = total > 0 ? (successful / total) * 100 : 0;

    await this.workflowRepo.update(workflowId, {
      executionCount: total,
      successRate: parseFloat(successRate.toFixed(2)),
      averageExecutionTime: avgTime,
      lastExecutedAt: new Date(),
    });
  }

  async getWorkflowExecutions(
    workflowId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<WorkflowExecution[]> {
    return this.executionRepo.find({
      where: { workflowId },
      order: { startedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async getExecutionById(executionId: string): Promise<WorkflowExecution> {
    const execution = await this.executionRepo.findOne({
      where: { id: executionId },
      relations: ['workflow'],
    });

    if (!execution) {
      throw new NotFoundException('Execution not found');
    }

    return execution;
  }

  async cancelExecution(executionId: string): Promise<void> {
    await this.executionRepo.update(executionId, {
      status: ExecutionStatus.CANCELLED,
      completedAt: new Date(),
    });
  }

  async retryExecution(executionId: string): Promise<WorkflowExecution> {
    const execution = await this.getExecutionById(executionId);

    if (execution.retryCount >= execution.maxRetries) {
      throw new Error('Maximum retry count exceeded');
    }

    // Reset execution for retry
    await this.executionRepo.update(executionId, {
      status: ExecutionStatus.PENDING,
      errorMessage: undefined,
      retryCount: execution.retryCount + 1,
      nextRetryAt: new Date(Date.now() + 60000), // Retry in 1 minute
    });

    // Re-execute workflow
    return this.executeWorkflow(execution.workflowId, execution.context);
  }
}
