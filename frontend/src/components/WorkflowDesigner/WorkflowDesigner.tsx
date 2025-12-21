'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  NodeTypes,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import Button from '../Button';
import Modal from '../Modal';
import Spinner from '../Spinner';
import {
  PlayIcon,
  StopIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  Cog6ToothIcon,
  TrashIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';

// Node Data Interfaces
interface BaseNodeData {
  label: string;
  description?: string;
}

interface StartNodeData extends BaseNodeData {
  type: 'start';
}

interface EndNodeData extends BaseNodeData {
  type: 'end';
}

interface StatusNodeData extends BaseNodeData {
  type: 'status';
  status: string;
  color: string;
}

interface DecisionNodeData extends BaseNodeData {
  type: 'decision';
  condition: string;
  trueLabel: string;
  falseLabel: string;
}

interface ActionNodeData extends BaseNodeData {
  type: 'action';
  action: string;
  parameters: Record<string, unknown>;
}

interface ApprovalNodeData extends BaseNodeData {
  type: 'approval';
  approvers: string[];
  timeout: number;
}

// interface ParallelNodeData extends BaseNodeData {
//   type: 'parallel';
//   branches: string[];
// }

// interface MergeNodeData extends BaseNodeData {
//   type: 'merge';
//   condition: string;
// }

// type NodeData = StartNodeData | EndNodeData | StatusNodeData | DecisionNodeData | ActionNodeData | ApprovalNodeData | ParallelNodeData | MergeNodeData;

// Custom Node Components
const StartNode = ({ data, selected }: { data: StartNodeData; selected: boolean }) => (
  <div className={`px-4 py-2 rounded-lg border-2 ${
    selected ? 'border-green-500 bg-green-50' : 'border-green-300 bg-white'
  }`}>
    <div className="flex items-center gap-2">
      <PlayIcon className="h-5 w-5 text-green-600" />
      <span className="font-medium text-green-800">{data.label}</span>
    </div>
  </div>
);

const EndNode = ({ data, selected }: { data: EndNodeData; selected: boolean }) => (
  <div className={`px-4 py-2 rounded-lg border-2 ${
    selected ? 'border-red-500 bg-red-50' : 'border-red-300 bg-white'
  }`}>
    <div className="flex items-center gap-2">
      <StopIcon className="h-5 w-5 text-red-600" />
      <span className="font-medium text-red-800">{data.label}</span>
    </div>
  </div>
);

const StatusNode = ({ data, selected }: { data: StatusNodeData; selected: boolean }) => (
  <div className={`px-4 py-2 rounded-lg border-2 ${
    selected ? 'border-blue-500 bg-blue-50' : 'border-blue-300 bg-white'
  }`}>
    <div className="flex items-center gap-2">
      <Cog6ToothIcon className="h-5 w-5 text-blue-600" />
      <span className="font-medium text-blue-800">{data.label}</span>
    </div>
    {data.status && (
      <div className="text-xs text-blue-600 mt-1">
        Status: {data.status}
      </div>
    )}
  </div>
);

const DecisionNode = ({ data, selected }: { data: DecisionNodeData; selected: boolean }) => (
  <div className={`px-4 py-2 rounded-lg border-2 ${
    selected ? 'border-yellow-500 bg-yellow-50' : 'border-yellow-300 bg-white'
  }`}>
    <div className="flex items-center gap-2">
      <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
      <span className="font-medium text-yellow-800">{data.label}</span>
    </div>
    {data.condition && (
      <div className="text-xs text-yellow-600 mt-1">
        {data.condition}
      </div>
    )}
  </div>
);

const ActionNode = ({ data, selected }: { data: ActionNodeData; selected: boolean }) => (
  <div className={`px-4 py-2 rounded-lg border-2 ${
    selected ? 'border-purple-500 bg-purple-50' : 'border-purple-300 bg-white'
  }`}>
    <div className="flex items-center gap-2">
      <Cog6ToothIcon className="h-5 w-5 text-purple-600" />
      <span className="font-medium text-purple-800">{data.label}</span>
    </div>
    {data.action && (
      <div className="text-xs text-purple-600 mt-1">
        Action: {data.action}
      </div>
    )}
  </div>
);

const ApprovalNode = ({ data, selected }: { data: ApprovalNodeData; selected: boolean }) => (
  <div className={`px-4 py-2 rounded-lg border-2 ${
    selected ? 'border-cyan-500 bg-cyan-50' : 'border-cyan-300 bg-white'
  }`}>
    <div className="flex items-center gap-2">
      <CheckIcon className="h-5 w-5 text-cyan-600" />
      <span className="font-medium text-cyan-800">{data.label}</span>
    </div>
    {data.approvers && data.approvers.length > 0 && (
      <div className="text-xs text-cyan-600 mt-1">
        {data.approvers.length} approver(s)
      </div>
    )}
  </div>
);

const nodeTypes: NodeTypes = {
  start: StartNode,
  end: EndNode,
  status: StatusNode,
  decision: DecisionNode,
  action: ActionNode,
  approval: ApprovalNode,
};

export interface WorkflowDefinition {
  nodes: Node[];
  connections: Edge[];
  metadata: Record<string, unknown>;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowDesignerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (workflow: Workflow) => void;
  initialWorkflow?: Workflow;
  projectId: string;
}

export default function WorkflowDesigner({
  isOpen,
  onClose,
  onSave,
  initialWorkflow,
  projectId,
}: WorkflowDesignerProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ isValid: boolean; errors?: string[] } | null>(null);
  const [simulationResult, setSimulationResult] = useState<{ success: boolean; steps?: string[]; duration?: number; executionPath?: string[] } | null>(null);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [, setReactFlowInstance] = useState<unknown>(null);

  // Initialize workflow
  useEffect(() => {
    if (isOpen && initialWorkflow) {
      setWorkflowName(initialWorkflow.name || '');
      setWorkflowDescription(initialWorkflow.description || '');
      
      if (initialWorkflow.definition) {
        setNodes(initialWorkflow.definition.nodes || []);
        setEdges(initialWorkflow.definition.connections || []);
      }
    } else if (isOpen) {
      // Reset for new workflow
      setWorkflowName('');
      setWorkflowDescription('');
      setNodes([
        {
          id: 'start-1',
          type: 'start',
          position: { x: 100, y: 100 },
          data: { label: 'Start' },
        },
      ]);
      setEdges([]);
    }
  }, [isOpen, initialWorkflow, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge = {
        ...params,
        id: `edge-${Date.now()}`,
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: '#6B7280',
        },
      };
      setEdges((eds: Edge[]) => addEdge(newEdge, eds));
    },
    [setEdges]
  );

  const addNode = (type: string) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 300 + 100,
      },
      data: {
        label: type.charAt(0).toUpperCase() + type.slice(1),
        ...getDefaultNodeData(type),
      },
    };

    setNodes((nds: Node[]) => [...nds, newNode]);
  };

  const getDefaultNodeData = (type: string) => {
    switch (type) {
      case 'status':
        return { status: 'in_progress' };
      case 'decision':
        return { condition: 'context.priority === "high"' };
      case 'action':
        return { action: 'send_notification' };
      case 'approval':
        return { approvers: [] };
      default:
        return {};
    }
  };

  const deleteSelectedNode = () => {
    if (selectedNode) {
      setNodes((nds: Node[]) => nds.filter((node: Node) => node.id !== selectedNode.id));
      setEdges((eds: Edge[]) => eds.filter((edge: Edge) => 
        edge.source !== selectedNode.id && edge.target !== selectedNode.id
      ));
      setSelectedNode(null);
    }
  };

  const duplicateNode = () => {
    if (selectedNode) {
      const newNode: Node = {
        ...selectedNode,
        id: `${selectedNode.type}-${Date.now()}`,
        position: {
          x: selectedNode.position.x + 50,
          y: selectedNode.position.y + 50,
        },
      };
      setNodes((nds: Node[]) => [...nds, newNode]);
    }
  };

  const validateWorkflow = async () => {
    setIsValidating(true);
    setError(null);

    try {
      const response = await fetch('/api/workflow-designer/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          definition: {
            nodes: nodes.map(node => ({
              id: node.id,
              type: node.type,
              name: node.data.label,
              position: node.position,
              config: node.data,
            })),
            connections: edges.map(edge => ({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              condition: edge.data?.condition,
            })),
          },
        }),
      });

      const result = await response.json();
      setValidationResult(result.data);
    } catch (err) {
      console.error('Failed to validate workflow:', err);
      setError('Failed to validate workflow');
    } finally {
      setIsValidating(false);
    }
  };

  const simulateWorkflow = async () => {
    setIsSimulating(true);
    setError(null);

    try {
      const response = await fetch('/api/workflow-designer/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          definition: {
            nodes: nodes.map(node => ({
              id: node.id,
              type: node.type,
              name: node.data.label,
              position: node.position,
              config: node.data,
            })),
            connections: edges.map(edge => ({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              condition: edge.data?.condition,
            })),
          },
          testData: {
            priority: 'high',
            status: 'todo',
          },
        }),
      });

      const result = await response.json();
      setSimulationResult(result.data);
    } catch (err) {
      console.error('Failed to simulate workflow:', err);
      setError('Failed to simulate workflow');
    } finally {
      setIsSimulating(false);
    }
  };

  const saveWorkflow = async () => {
    if (!workflowName.trim()) {
      setError('Workflow name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const workflowData = {
        projectId,
        name: workflowName,
        description: workflowDescription,
        definition: {
          nodes: nodes.map(node => ({
            id: node.id,
            type: node.type,
            name: node.data.label,
            position: node.position,
            config: node.data,
          })),
          connections: edges.map(edge => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            condition: edge.data?.condition,
          })),
        },
        tags: ['custom'],
        category: 'custom',
      };

      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify(workflowData),
      });

      const result = await response.json();

      if (result.success) {
        onSave?.(result.data);
        onClose();
      } else {
        setError(result.error || 'Failed to save workflow');
      }
    } catch (err) {
      console.error('Failed to save workflow:', err);
      setError('Failed to save workflow');
    } finally {
      setLoading(false);
    }
  };

  const onNodeClick = (event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  };

  const onPaneClick = () => {
    setSelectedNode(null);
  };

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={onClose}>
      <div className="flex h-[80vh]">
        {/* Sidebar */}
        <div className="w-80 bg-neutral-50 dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-700 flex flex-col">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Workflow Designer
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              Create and design your workflow
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Workflow Details */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Workflow Name
              </label>
              <input
                type="text"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white"
                placeholder="Enter workflow name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Description
              </label>
              <textarea
                value={workflowDescription}
                onChange={(e) => setWorkflowDescription(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white"
                placeholder="Enter workflow description"
                rows={3}
              />
            </div>

            {/* Node Types */}
            <div>
              <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Add Nodes
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { type: 'start', label: 'Start', icon: '▶️' },
                  { type: 'end', label: 'End', icon: '⏹️' },
                  { type: 'status', label: 'Status', icon: '📊' },
                  { type: 'decision', label: 'Decision', icon: '❓' },
                  { type: 'action', label: 'Action', icon: '⚙️' },
                  { type: 'approval', label: 'Approval', icon: '✅' },
                ].map((nodeType) => (
                  <button
                    key={nodeType.type}
                    onClick={() => addNode(nodeType.type)}
                    className="p-2 text-xs border border-neutral-300 dark:border-neutral-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300"
                  >
                    <div className="text-lg mb-1">{nodeType.icon}</div>
                    <div>{nodeType.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Node Actions */}
            {selectedNode && (
              <div>
                <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Node Actions
                </h3>
                <div className="space-y-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={duplicateNode}
                    className="w-full"
                  >
                    <DocumentDuplicateIcon className="h-4 w-4 mr-2" />
                    Duplicate
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={deleteSelectedNode}
                    className="w-full text-red-600 hover:text-red-700"
                  >
                    <TrashIcon className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            )}

            {/* Validation & Simulation */}
            <div className="space-y-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={validateWorkflow}
                disabled={isValidating}
                className="w-full"
              >
                {isValidating ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <CheckIcon className="h-4 w-4 mr-2" />
                )}
                Validate
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={simulateWorkflow}
                disabled={isSimulating}
                className="w-full"
              >
                {isSimulating ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <PlayIcon className="h-4 w-4 mr-2" />
                )}
                Simulate
              </Button>
            </div>

            {/* Validation Results */}
            {validationResult && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Validation Results
                </h4>
                <div className={`p-3 rounded-lg text-sm ${
                  validationResult.isValid
                    ? 'bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-red-50 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`}>
                  {validationResult.isValid ? (
                    <div className="flex items-center">
                      <CheckIcon className="h-4 w-4 mr-2" />
                      Workflow is valid
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center mb-2">
                        <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
                        Validation failed
                      </div>
                      <ul className="list-disc list-inside space-y-1">
                        {validationResult.errors?.map((error: string, index: number) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Simulation Results */}
            {simulationResult && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                  Simulation Results
                </h4>
                <div className={`p-3 rounded-lg text-sm ${
                  simulationResult.success
                    ? 'bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-red-50 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`}>
                  <div className="flex items-center mb-2">
                    {simulationResult.success ? (
                      <CheckIcon className="h-4 w-4 mr-2" />
                    ) : (
                      <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
                    )}
                    {simulationResult.success ? 'Simulation successful' : 'Simulation failed'}
                  </div>
                  <div className="text-xs">
                    Execution time: {simulationResult.duration}ms
                  </div>
                  <div className="text-xs">
                    Path: {simulationResult.executionPath?.join(' → ')}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 space-y-2">
            {error && (
              <div className="text-red-600 text-sm">{error}</div>
            )}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={onClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={saveWorkflow}
                disabled={loading || !workflowName.trim()}
                className="flex-1"
              >
                {loading ? <Spinner className="h-4 w-4" /> : 'Save Workflow'}
              </Button>
            </div>
          </div>
        </div>

        {/* Workflow Canvas */}
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-left"
          >
            <Controls />
            <Background />
            <MiniMap />
          </ReactFlow>
        </div>
      </div>
    </Modal>
  );
}
