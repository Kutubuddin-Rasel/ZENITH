/**
 * Workflow Worker - Isolated Execution Environment
 *
 * SECURITY (Phase 6): Executes workflow logic in a Worker Thread to:
 * 1. Prevent Event Loop blocking from CPU-intensive operations
 * 2. Enable forced termination via timeout (kill switch)
 * 3. Contain crashes without affecting the main API
 *
 * This worker receives workflow data + context, executes nodes,
 * and posts results back to the main thread.
 */

import { parentPort, workerData } from 'worker_threads';
import * as jsonLogic from 'json-logic-js';

// Types mirrored from main thread (to avoid circular deps in worker)
interface WorkflowNode {
    id: string;
    type: string;
    name: string;
    description?: string;
    position: { x: number; y: number };
    config: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

interface WorkflowConnection {
    id: string;
    source: string;
    target: string;
    condition?: string | Record<string, unknown>;
    label?: string;
    config?: Record<string, unknown>;
}

interface WorkflowDefinition {
    nodes: WorkflowNode[];
    connections: WorkflowConnection[];
    variables?: Record<string, unknown>;
    settings?: {
        allowParallelExecution?: boolean;
        maxExecutionTime?: number;
        retryOnFailure?: boolean;
        retryCount?: number;
    };
}

interface ExecutionContext {
    triggerEvent: string;
    issueId?: string;
    projectId?: string;
    userId?: string;
    data?: Record<string, unknown>;
    [key: string]: unknown;
}

interface ExecutionLog {
    id: string;
    timestamp: Date;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    nodeId?: string;
    data?: Record<string, unknown>;
}

interface WorkerInput {
    definition: WorkflowDefinition;
    context: ExecutionContext;
}

interface WorkerOutput {
    success: boolean;
    result?: Record<string, unknown>;
    logs?: ExecutionLog[];
    error?: string;
}

/**
 * Evaluate JSON Logic condition safely
 */
function evaluateCondition(
    condition: string | Record<string, unknown>,
    context: ExecutionContext,
): boolean {
    try {
        if (typeof condition === 'string') {
            // Legacy string condition - try to parse as JSON
            try {
                const parsed = JSON.parse(condition) as Record<string, unknown>;
                return Boolean(jsonLogic.apply(parsed, context as unknown as Record<string, unknown>));
            } catch {
                // Cannot parse - reject for safety
                return false;
            }
        }
        // JSON Logic object
        return Boolean(jsonLogic.apply(condition, context as unknown as Record<string, unknown>));
    } catch {
        return false;
    }
}

/**
 * Execute a single workflow node
 */
function executeNode(
    node: WorkflowNode,
    context: ExecutionContext,
    logs: ExecutionLog[],
    result: Record<string, unknown>,
): void {
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
                logEntry.message = 'Workflow started';
                break;

            case 'end':
                logEntry.message = 'Workflow completed';
                break;

            case 'action':
                // Execute action based on config
                result[node.id] = {
                    executed: true,
                    action: node.config.action,
                    timestamp: new Date(),
                };
                break;

            case 'decision':
                // Decision nodes are handled by connection conditions
                break;

            case 'status':
                result[node.id] = {
                    status: node.config.status,
                    timestamp: new Date(),
                };
                break;

            default:
                result[node.id] = { executed: true };
        }

        logs.push(logEntry);
    } catch (error) {
        logEntry.level = 'error';
        logEntry.message = `Node execution failed: ${(error as Error).message}`;
        logs.push(logEntry);
        throw error;
    }
}

/**
 * Process connections and execute connected nodes
 */
function processConnections(
    currentNodeId: string,
    connections: WorkflowConnection[],
    nodes: WorkflowNode[],
    context: ExecutionContext,
    visitedNodes: Set<string>,
    logs: ExecutionLog[],
    result: Record<string, unknown>,
): void {
    const outgoingConnections = connections.filter(
        (conn) => conn.source === currentNodeId,
    );

    for (const connection of outgoingConnections) {
        const targetNode = nodes.find((node) => node.id === connection.target);
        if (!targetNode || visitedNodes.has(targetNode.id)) {
            continue;
        }

        // Check condition if exists
        if (connection.condition && !evaluateCondition(connection.condition, context)) {
            continue;
        }

        // Execute target node
        executeNode(targetNode, context, logs, result);
        visitedNodes.add(targetNode.id);

        // Recursively process connections
        processConnections(
            targetNode.id,
            connections,
            nodes,
            context,
            visitedNodes,
            logs,
            result,
        );
    }
}

/**
 * Main workflow execution
 */
function runWorkflow(input: WorkerInput): WorkerOutput {
    const { definition, context } = input;
    const { nodes, connections } = definition;
    const visitedNodes = new Set<string>();
    const logs: ExecutionLog[] = [];
    const result: Record<string, unknown> = {};

    try {
        // Find start node
        const startNode = nodes.find((node) => node.type === 'start');
        if (!startNode) {
            return {
                success: false,
                error: 'Workflow must have a start node',
                logs,
            };
        }

        // Execute start node
        executeNode(startNode, context, logs, result);
        visitedNodes.add(startNode.id);

        // Process connections
        processConnections(
            startNode.id,
            connections,
            nodes,
            context,
            visitedNodes,
            logs,
            result,
        );

        return {
            success: true,
            result,
            logs,
        };
    } catch (error) {
        return {
            success: false,
            error: (error as Error).message,
            logs,
        };
    }
}

// Worker entry point
if (parentPort) {
    try {
        const input = workerData as WorkerInput;
        const output = runWorkflow(input);
        parentPort.postMessage(output);
    } catch (error) {
        parentPort.postMessage({
            success: false,
            error: (error as Error).message,
        });
    }
}
