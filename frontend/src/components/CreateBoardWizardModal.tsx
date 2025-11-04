import React, { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { Squares2X2Icon, RectangleStackIcon, ArrowRightIcon, ArrowLeftIcon, PlusIcon, TrashIcon, Bars3Icon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Transition } from '@headlessui/react';

export type BoardType = 'scrum' | 'kanban';

interface CreateBoardWizardModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    type: BoardType;
    name: string;
    description?: string;
    columns: { name: string }[];
  }) => Promise<void>;
  defaultProjectName?: string;
}

const DEFAULT_COLUMNS = {
  scrum: [
    { name: 'Backlog' },
    { name: 'Selected for Development' },
    { name: 'In Progress' },
    { name: 'Done' },
  ],
  kanban: [
    { name: 'To Do' },
    { name: 'In Progress' },
    { name: 'Done' },
  ],
};

const steps = [
  'Board Type',
  'Details',
  'Columns',
  'Review',
];

const CreateBoardWizardModal: React.FC<CreateBoardWizardModalProps> = ({ open, onClose, onCreate, defaultProjectName }) => {
  const [step, setStep] = useState(0);
  const [type, setType] = useState<BoardType>('scrum');
  const [name, setName] = useState('');
  const [columns, setColumns] = useState(DEFAULT_COLUMNS['scrum']);
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset columns when board type changes
  React.useEffect(() => {
    setColumns(DEFAULT_COLUMNS[type]);
  }, [type]);

  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const handleAddColumn = () => setColumns([...columns, { name: '' }]);
  const handleRemoveColumn = (idx: number) => setColumns(columns.filter((_, i) => i !== idx));
  const handleColumnNameChange = (idx: number, value: string) => setColumns(columns.map((col, i) => i === idx ? { ...col, name: value } : col));
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(columns);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setColumns(reordered);
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await onCreate({ type, name, description, columns });
      setCreating(false);
      onClose();
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to create board';
      setError(errorMessage);
      setCreating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Board" maxWidthClass="sm:max-w-2xl">
      {/* Stepper Bar */}
      <div className="mb-8">
        <ol className="flex items-center w-full space-x-4">
          {steps.map((label, idx) => (
            <li key={label} className="flex-1 flex flex-col items-center">
              <div className={`w-8 h-8 flex items-center justify-center rounded-full border-2 font-bold text-sm transition-all duration-300 ${step === idx ? 'bg-blue-500 text-white border-blue-500 scale-110 shadow-lg' : step > idx ? 'bg-blue-100 dark:bg-blue-900 text-blue-500 border-blue-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-300 dark:border-gray-700'}`}>{idx + 1}</div>
              <span className={`mt-2 text-xs font-semibold transition-colors ${step === idx ? 'text-blue-600 dark:text-blue-300' : 'text-gray-400 dark:text-gray-500'}`}>{label}</span>
            </li>
          ))}
        </ol>
        <div className="h-1 w-full bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 rounded-full mt-4" style={{ width: `${((step + 1) / steps.length) * 100}%`, transition: 'width 0.4s' }} />
      </div>
      {/* Step Content with Animation */}
      <div className="min-h-[220px]">
        <Transition
          show={step === 0}
          enter="transition-opacity duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="flex flex-col gap-6">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setType('scrum')}
                className={`flex-1 rounded-2xl border-2 p-6 flex flex-col items-center gap-2 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 ${type === 'scrum' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-300'}`}
                aria-label="Select Scrum Board"
              >
                <div className="flex items-center gap-2">
                  <Squares2X2Icon className="h-8 w-8 text-blue-500" />
                  <span className="relative group">
                    <InformationCircleIcon className="h-5 w-5 text-gray-400 hover:text-blue-500 ml-1" aria-hidden="true" />
                    <span className="absolute left-1/2 -translate-x-1/2 mt-2 w-48 bg-white dark:bg-gray-900 text-xs text-gray-700 dark:text-gray-200 rounded-lg shadow-lg px-3 py-2 opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity duration-200">
                      Scrum boards are for sprint-based, iterative work. Plan, track, and complete work in time-boxed sprints.
                    </span>
                  </span>
                </div>
                <span className="font-bold">Scrum Board</span>
                <span className="text-xs text-gray-500">Sprint-based, iterative work</span>
              </button>
              <button
                type="button"
                onClick={() => setType('kanban')}
                className={`flex-1 rounded-2xl border-2 p-6 flex flex-col items-center gap-2 transition-all focus:outline-none focus:ring-2 focus:ring-purple-400 ${type === 'kanban' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-300'}`}
                aria-label="Select Kanban Board"
              >
                <div className="flex items-center gap-2">
                  <RectangleStackIcon className="h-8 w-8 text-purple-500" />
                  <span className="relative group">
                    <InformationCircleIcon className="h-5 w-5 text-gray-400 hover:text-purple-500 ml-1" aria-hidden="true" />
                    <span className="absolute left-1/2 -translate-x-1/2 mt-2 w-48 bg-white dark:bg-gray-900 text-xs text-gray-700 dark:text-gray-200 rounded-lg shadow-lg px-3 py-2 opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity duration-200">
                      Kanban boards are for continuous flow. Move work items through flexible stages at your own pace.
                    </span>
                  </span>
                </div>
                <span className="font-bold">Kanban Board</span>
                <span className="text-xs text-gray-500">Continuous flow, flexible</span>
              </button>
            </div>
          </div>
        </Transition>
        <Transition
          show={step === 1}
          enter="transition-opacity duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="flex flex-col gap-6">
            <Input label="Board Name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Website Redesign" required aria-label="Board Name" />
            <Input label="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe this board (optional)" aria-label="Board Description" />
            {defaultProjectName && (
              <div className="text-xs text-gray-500">Project: <span className="font-semibold text-gray-700 dark:text-gray-200">{defaultProjectName}</span></div>
            )}
          </div>
        </Transition>
        <Transition
          show={step === 2}
          enter="transition-opacity duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="flex flex-col gap-4">
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="columns">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-2">
                    {columns.map((col, idx) => (
                      <Draggable draggableId={`col-${idx}`} index={idx} key={idx}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center gap-2 rounded-xl bg-gradient-to-r from-gray-50/80 via-white/80 to-gray-100/80 dark:from-gray-800/80 dark:via-gray-900/80 dark:to-gray-800/80 border border-gray-100 dark:border-gray-800 p-2 shadow-sm transition-all duration-200 ${snapshot.isDragging ? 'ring-2 ring-blue-400 scale-105' : 'hover:shadow-md hover:bg-blue-50/40 dark:hover:bg-blue-950/20'}`}
                          >
                            <span {...provided.dragHandleProps} className="cursor-grab text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400" aria-label="Drag column">
                              <Bars3Icon className="h-5 w-5" />
                            </span>
                            <Input value={col.name} onChange={e => handleColumnNameChange(idx, e.target.value)} className="flex-1" placeholder={`Column ${idx + 1}`} required aria-label={`Column ${idx + 1} Name`} />
                            <button type="button" onClick={() => handleRemoveColumn(idx)} className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400" aria-label="Remove column">
                              <TrashIcon className="h-4 w-4 text-red-500" />
                            </button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            <Button type="button" variant="secondary" size="sm" onClick={handleAddColumn} className="mt-2" aria-label="Add column">
              <PlusIcon className="h-4 w-4 mr-1" /> Add Column
            </Button>
          </div>
        </Transition>
        <Transition
          show={step === 3}
          enter="transition-opacity duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="flex flex-col gap-6">
            <div>
              <div className="font-semibold mb-2">Board Type</div>
              <div className="flex items-center gap-2">
                {type === 'scrum' ? <Squares2X2Icon className="h-5 w-5 text-blue-500" /> : <RectangleStackIcon className="h-5 w-5 text-purple-500" />}
                <span className="capitalize">{type}</span>
              </div>
            </div>
            <div>
              <div className="font-semibold mb-2">Board Name</div>
              <div>{name}</div>
            </div>
            {description && (
              <div>
                <div className="font-semibold mb-2">Description</div>
                <div className="text-gray-600 dark:text-gray-300">{description}</div>
              </div>
            )}
            <div>
              <div className="font-semibold mb-2">Columns</div>
              <ul className="list-disc ml-6">
                {columns.map((col, idx) => <li key={idx}>{col.name}</li>)}
              </ul>
            </div>
          </div>
        </Transition>
      </div>
      {/* Error */}
      {error && <div className="mt-4 text-red-600 text-sm">{error}</div>}
      {/* Navigation */}
      <div className="mt-8 flex justify-between items-center gap-4">
        <Button type="button" variant="secondary" size="sm" onClick={step === 0 ? onClose : prev} aria-label={step === 0 ? 'Cancel' : 'Back'}>
          {step === 0 ? 'Cancel' : <><ArrowLeftIcon className="h-4 w-4 mr-1" /> Back</>}
        </Button>
        {step < steps.length - 1 ? (
          <Button type="button" size="sm" onClick={next} disabled={step === 1 && !name.trim()} aria-label="Next">
            Next <ArrowRightIcon className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={handleCreate} loading={creating} disabled={creating || !name.trim() || columns.some(c => !c.name.trim())} aria-label="Create Board">
            Create Board
          </Button>
        )}
      </div>
    </Modal>
  );
};

export default CreateBoardWizardModal; 