import { Injectable, Logger } from '@nestjs/common';
import {
  WorkflowNode,
  WorkflowConnection,
  WorkflowDefinition,
} from '../entities/workflow.entity';

export interface NodeType {
  id: string;
  name: string;
  description: string;
  category: 'basic' | 'logic' | 'action' | 'integration' | 'approval';
  icon: string;
  color: string;
  inputs: NodeInput[];
  outputs: NodeOutput[];
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
}

export interface NodeInput {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description?: string;
}

export interface NodeOutput {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
}

export interface WorkflowValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: 'node' | 'connection' | 'workflow';
  nodeId?: string;
  connectionId?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  type: 'performance' | 'best_practice' | 'compatibility';
  nodeId?: string;
  message: string;
  suggestion?: string;
}

export interface WorkflowSimulationResult {
  success: boolean;
  executionPath: string[];
  executionTime: number;
  errors: string[];
  warnings: string[];
  result: Record<string, unknown>;
}

@Injectable()
export class WorkflowDesignerService {
  private readonly logger = new Logger(WorkflowDesignerService.name);

  private readonly nodeTypes: NodeType[] = [
    {
      id: 'start',
      name: 'Start',
      description: 'Workflow entry point',
      category: 'basic',
      icon: 'play-circle',
      color: '#10B981',
      inputs: [],
      outputs: [{ id: 'output', name: 'Output', type: 'object' }],
      configSchema: {},
      defaultConfig: {},
    },
    {
      id: 'end',
      name: 'End',
      description: 'Workflow exit point',
      category: 'basic',
      icon: 'stop-circle',
      color: '#EF4444',
      inputs: [{ id: 'input', name: 'Input', type: 'object', required: true }],
      outputs: [],
      configSchema: {},
      defaultConfig: {},
    },
    {
      id: 'status',
      name: 'Status Update',
      description: 'Update issue or task status',
      category: 'action',
      icon: 'arrow-right-circle',
      color: '#3B82F6',
      inputs: [{ id: 'input', name: 'Input', type: 'object', required: true }],
      outputs: [{ id: 'output', name: 'Output', type: 'object' }],
      configSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['todo', 'in_progress', 'review', 'done', 'cancelled'],
          },
        },
        required: ['status'],
      },
      defaultConfig: {
        status: 'in_progress',
      },
    },
    {
      id: 'decision',
      name: 'Decision',
      description: 'Conditional branching based on data',
      category: 'logic',
      icon: 'question-mark-circle',
      color: '#F59E0B',
      inputs: [{ id: 'input', name: 'Input', type: 'object', required: true }],
      outputs: [
        { id: 'true', name: 'True', type: 'object' },
        { id: 'false', name: 'False', type: 'object' },
      ],
      configSchema: {
        type: 'object',
        properties: {
          condition: {
            type: 'string',
            description: 'JavaScript expression to evaluate',
          },
        },
        required: ['condition'],
      },
      defaultConfig: {
        condition: 'context.status === "completed"',
      },
    },
    {
      id: 'action',
      name: 'Action',
      description: 'Execute a custom action',
      category: 'action',
      icon: 'cog-6-tooth',
      color: '#8B5CF6',
      inputs: [{ id: 'input', name: 'Input', type: 'object', required: true }],
      outputs: [{ id: 'output', name: 'Output', type: 'object' }],
      configSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'send_notification',
              'assign_user',
              'update_field',
              'create_issue',
              'send_email',
            ],
          },
          config: {
            type: 'object',
            description: 'Action-specific configuration',
          },
        },
        required: ['action'],
      },
      defaultConfig: {
        action: 'send_notification',
        config: {},
      },
    },
    {
      id: 'approval',
      name: 'Approval',
      description: 'Require approval from specified users',
      category: 'approval',
      icon: 'check-circle',
      color: '#06B6D4',
      inputs: [{ id: 'input', name: 'Input', type: 'object', required: true }],
      outputs: [
        { id: 'approved', name: 'Approved', type: 'object' },
        { id: 'rejected', name: 'Rejected', type: 'object' },
      ],
      configSchema: {
        type: 'object',
        properties: {
          approvers: {
            type: 'array',
            items: { type: 'string' },
            description: 'User IDs of approvers',
          },
          autoApprove: {
            type: 'boolean',
            description: 'Auto-approve if all approvers are the same user',
          },
          timeout: {
            type: 'number',
            description: 'Approval timeout in hours',
          },
        },
        required: ['approvers'],
      },
      defaultConfig: {
        approvers: [],
        autoApprove: false,
        timeout: 24,
      },
    },
    {
      id: 'parallel',
      name: 'Parallel',
      description: 'Execute multiple branches in parallel',
      category: 'logic',
      icon: 'arrows-right-left',
      color: '#84CC16',
      inputs: [{ id: 'input', name: 'Input', type: 'object', required: true }],
      outputs: [
        { id: 'branch1', name: 'Branch 1', type: 'object' },
        { id: 'branch2', name: 'Branch 2', type: 'object' },
        { id: 'branch3', name: 'Branch 3', type: 'object' },
      ],
      configSchema: {
        type: 'object',
        properties: {
          branches: {
            type: 'array',
            items: { type: 'string' },
            description: 'Branch names',
          },
        },
      },
      defaultConfig: {
        branches: ['branch1', 'branch2'],
      },
    },
    {
      id: 'merge',
      name: 'Merge',
      description: 'Merge multiple parallel branches',
      category: 'logic',
      icon: 'arrows-pointing-in',
      color: '#F97316',
      inputs: [
        { id: 'input1', name: 'Input 1', type: 'object', required: true },
        { id: 'input2', name: 'Input 2', type: 'object', required: true },
      ],
      outputs: [{ id: 'output', name: 'Output', type: 'object' }],
      configSchema: {
        type: 'object',
        properties: {
          mergeStrategy: {
            type: 'string',
            enum: ['all', 'any', 'first', 'last'],
            description: 'How to merge the inputs',
          },
        },
      },
      defaultConfig: {
        mergeStrategy: 'all',
      },
    },
  ];

  getAvailableNodeTypes(): NodeType[] {
    return this.nodeTypes;
  }

  getNodeTypeById(nodeTypeId: string): NodeType | undefined {
    return this.nodeTypes.find((nodeType) => nodeType.id === nodeTypeId);
  }

  validateWorkflow(definition: WorkflowDefinition): WorkflowValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check for start node
    const startNodes = definition.nodes.filter((node) => node.type === 'start');
    if (startNodes.length === 0) {
      errors.push({
        type: 'workflow',
        message: 'Workflow must have at least one start node',
        severity: 'error',
      });
    } else if (startNodes.length > 1) {
      errors.push({
        type: 'workflow',
        message: 'Workflow can only have one start node',
        severity: 'error',
      });
    }

    // Check for end node
    const endNodes = definition.nodes.filter((node) => node.type === 'end');
    if (endNodes.length === 0) {
      warnings.push({
        type: 'best_practice',
        message: 'Workflow should have at least one end node',
        suggestion: 'Add an end node to properly terminate the workflow',
      });
    }

    // Validate each node
    for (const node of definition.nodes) {
      this.validateNode(node, errors);
    }

    // Validate connections
    for (const connection of definition.connections) {
      this.validateConnection(connection, definition.nodes, errors, warnings);
    }

    // Check for orphaned nodes
    this.checkOrphanedNodes(definition, errors, warnings);

    // Check for cycles
    this.checkCycles(definition, errors);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateNode(node: WorkflowNode, errors: ValidationError[]): void {
    const nodeType = this.getNodeTypeById(node.type);
    if (!nodeType) {
      errors.push({
        type: 'node',
        nodeId: node.id,
        message: `Unknown node type: ${node.type}`,
        severity: 'error',
      });
      return;
    }

    // Validate required configuration
    for (const [key, schema] of Object.entries(nodeType.configSchema)) {
      if (
        (schema as { required?: boolean }).required &&
        !(key in node.config)
      ) {
        errors.push({
          type: 'node',
          nodeId: node.id,
          message: `Required configuration missing: ${key}`,
          severity: 'error',
        });
      }
    }

    // Validate node-specific rules
    if (node.type === 'decision' && !node.config.condition) {
      errors.push({
        type: 'node',
        nodeId: node.id,
        message: 'Decision node must have a condition',
        severity: 'error',
      });
    }

    if (
      node.type === 'approval' &&
      (!(node.config as { approvers?: unknown[] }).approvers ||
        (node.config as { approvers?: unknown[] }).approvers?.length === 0)
    ) {
      errors.push({
        type: 'node',
        nodeId: node.id,
        message: 'Approval node must have at least one approver',
        severity: 'error',
      });
    }
  }

  private validateConnection(
    connection: WorkflowConnection,
    nodes: WorkflowNode[],
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);

    if (!sourceNode) {
      errors.push({
        type: 'connection',
        connectionId: connection.id,
        message: `Source node not found: ${connection.source}`,
        severity: 'error',
      });
    }

    if (!targetNode) {
      errors.push({
        type: 'connection',
        connectionId: connection.id,
        message: `Target node not found: ${connection.target}`,
        severity: 'error',
      });
    }

    if (sourceNode && targetNode) {
      const sourceNodeType = this.getNodeTypeById(sourceNode.type);
      const targetNodeType = this.getNodeTypeById(targetNode.type);

      if (sourceNodeType && targetNodeType) {
        // Check if connection is valid based on node types
        const validOutputs = sourceNodeType.outputs.map((output) => output.id);

        if (connection.source && !validOutputs.includes(connection.source)) {
          warnings.push({
            type: 'compatibility',
            nodeId: sourceNode.id,
            message: `Invalid output connection: ${connection.source}`,
            suggestion: `Valid outputs: ${validOutputs.join(', ')}`,
          });
        }
      }
    }
  }

  private checkOrphanedNodes(
    definition: WorkflowDefinition,
    errors: ValidationError[],
    warnings: ValidationWarning[],
  ): void {
    const connectedNodes = new Set<string>();

    for (const connection of definition.connections) {
      connectedNodes.add(connection.source);
      connectedNodes.add(connection.target);
    }

    for (const node of definition.nodes) {
      if (node.type !== 'start' && !connectedNodes.has(node.id)) {
        warnings.push({
          type: 'best_practice',
          nodeId: node.id,
          message: `Node "${node.name}" is not connected to the workflow`,
          suggestion: 'Connect this node to the workflow or remove it',
        });
      }
    }
  }

  private checkCycles(
    definition: WorkflowDefinition,
    errors: ValidationError[],
  ): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        return true;
      }

      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const outgoingConnections = definition.connections.filter(
        (conn) => conn.source === nodeId,
      );

      for (const connection of outgoingConnections) {
        if (hasCycle(connection.target)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of definition.nodes) {
      if (!visited.has(node.id) && hasCycle(node.id)) {
        errors.push({
          type: 'workflow',
          message: 'Workflow contains a cycle',
          severity: 'error',
        });
        break;
      }
    }
  }

  async simulateWorkflow(
    definition: WorkflowDefinition,
    testData: Record<string, unknown> = {},
  ): Promise<WorkflowSimulationResult> {
    const startTime = Date.now();
    const executionPath: string[] = [];
    const errors: string[] = [];
    // const warnings: string[] = [];
    const result: Record<string, unknown> = {};

    try {
      // Validate workflow first
      const validation = this.validateWorkflow(definition);
      if (!validation.isValid) {
        return {
          success: false,
          executionPath: [],
          executionTime: 0,
          errors: validation.errors.map((e) => e.message),
          warnings: validation.warnings.map((w) => w.message),
          result: {},
        };
      }

      // Find start node
      const startNode = definition.nodes.find((node) => node.type === 'start');
      if (!startNode) {
        throw new Error('No start node found');
      }

      // Simulate execution
      const context = { ...testData, workflowId: 'simulation' };
      await this.simulateNodeExecution(
        startNode,
        definition,
        context,
        executionPath,
        result,
      );

      return {
        success: true,
        executionPath,
        executionTime: Date.now() - startTime,
        errors,
        warnings: [],
        result,
      };
    } catch (error) {
      return {
        success: false,
        executionPath,
        executionTime: Date.now() - startTime,
        errors: [(error as Error).message],
        warnings: [],
        result,
      };
    }
  }

  private async simulateNodeExecution(
    node: WorkflowNode,
    definition: WorkflowDefinition,
    context: Record<string, unknown>,
    executionPath: string[],
    result: Record<string, unknown>,
  ): Promise<void> {
    executionPath.push(node.id);

    switch (node.type) {
      case 'start':
        result.workflowStarted = true;
        result.startTime = new Date().toISOString();
        break;
      case 'end':
        result.workflowCompleted = true;
        result.endTime = new Date().toISOString();
        return;
      case 'status':
        result.statusUpdated = true;
        result.newStatus = node.config.status;
        break;
      case 'decision':
        result.decisionResult = this.evaluateCondition(
          (node.config as { condition: string }).condition,
          context,
        );
        break;
      case 'action':
        result.actionExecuted = true;
        result.action = node.config.action;
        break;
      case 'approval':
        result.approvalRequired = true;
        result.approvers = node.config.approvers;
        break;
      case 'parallel':
        result.parallelExecution = true;
        result.branches = node.config.branches;
        break;
      case 'merge':
        result.mergeCompleted = true;
        result.mergeStrategy = node.config.mergeStrategy;
        break;
    }

    // Find and execute connected nodes
    const outgoingConnections = definition.connections.filter(
      (conn) => conn.source === node.id,
    );

    for (const connection of outgoingConnections) {
      const targetNode = definition.nodes.find(
        (n) => n.id === connection.target,
      );
      if (targetNode) {
        // Check condition if exists
        if (
          connection.condition &&
          !this.evaluateCondition(connection.condition, context)
        ) {
          continue;
        }

        await this.simulateNodeExecution(
          targetNode,
          definition,
          context,
          executionPath,
          result,
        );
      }
    }
  }

  private evaluateCondition(
    condition: string,
    context: Record<string, unknown>,
  ): boolean {
    try {
      // Simple condition evaluation for simulation
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
      return new Function('context', `return ${condition}`)(context) as boolean;
    } catch (error) {
      this.logger.warn(`Failed to evaluate condition: ${condition}`, error);
      return false;
    }
  }

  generateWorkflowCode(definition: WorkflowDefinition): string {
    // Generate executable code from workflow definition
    let code = '// Generated workflow code\n';
    code += 'async function executeWorkflow(context) {\n';
    code += '  const result = {};\n\n';

    for (const node of definition.nodes) {
      code += this.generateNodeCode(node);
    }

    code += '  return result;\n';
    code += '}\n';

    return code;
  }

  private generateNodeCode(node: WorkflowNode): string {
    let code = `  // Node: ${node.name}\n`;

    switch (node.type) {
      case 'start':
        code += '  result.workflowStarted = true;\n';
        break;
      case 'end':
        code += '  result.workflowCompleted = true;\n';
        break;
      case 'status':
        code += `  result.statusUpdated = true;\n`;
        code += `  result.newStatus = "${(node.config as { status: string }).status}";\n`;
        break;
      case 'decision':
        code += `  result.decisionResult = (${(node.config as { condition: string }).condition});\n`;
        break;
      case 'action':
        code += `  result.actionExecuted = true;\n`;
        code += `  result.action = "${(node.config as { action: string }).action}";\n`;
        break;
      case 'approval':
        code += `  result.approvalRequired = true;\n`;
        code += `  result.approvers = ${JSON.stringify(node.config.approvers)};\n`;
        break;
    }

    code += '\n';
    return code;
  }
}
