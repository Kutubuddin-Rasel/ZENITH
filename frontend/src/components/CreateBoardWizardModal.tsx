import React, { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { Squares2X2Icon, RectangleStackIcon, ArrowRightIcon, ArrowLeftIcon, PlusIcon, TrashIcon, Bars3Icon, InformationCircleIcon } from '@heroicons/react/24/outline';
import {
  DndContext,
  closestCenter,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

// Sortable Column Item for Wizard
function SortableWizardColumn({
  column,
  index,
  onNameChange,
  onRemove
}: {
  column: { name: string };
  index: number;
  onNameChange: (value: string) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `col-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-xl bg-gradient-to-r from-neutral-50/80 via-white/80 to-neutral-100/80 dark:from-neutral-800/80 dark:via-neutral-900/80 dark:to-neutral-800/80 border border-neutral-100 dark:border-neutral-800 p-2 shadow-sm transition-all duration-200 ${isDragging ? 'ring-2 ring-blue-400 scale-105 shadow-lg' : 'hover:shadow-md hover:bg-blue-50/40 dark:hover:bg-blue-950/20'
        }`}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
        aria-label="Drag column"
      >
        <Bars3Icon className="h-5 w-5" />
      </span>
      <Input
        value={column.name}
        onChange={e => onNameChange(e.target.value)}
        className="flex-1"
        placeholder={`Column ${index + 1}`}
        required
        aria-label={`Column ${index + 1} Name`}
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
        aria-label="Remove column"
      >
        <TrashIcon className="h-4 w-4 text-red-500" />
      </button>
    </div>
  );
}

// Drag Overlay for Column
function DragOverlayWizardColumn({ column }: { column: { name: string } }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-white dark:bg-neutral-800 border-2 border-blue-400 p-2 shadow-2xl">
      <Bars3Icon className="h-5 w-5 text-neutral-400" />
      <span className="flex-1 font-medium text-neutral-900 dark:text-white">{column.name || 'New Column'}</span>
    </div>
  );
}

const CreateBoardWizardModal: React.FC<CreateBoardWizardModalProps> = ({ open, onClose, onCreate, defaultProjectName }) => {
  const [step, setStep] = useState(0);
  const [type, setType] = useState<BoardType>('scrum');
  const [name, setName] = useState('');
  const [columns, setColumns] = useState(DEFAULT_COLUMNS['scrum']);
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Sensors for smooth DnD
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Reset columns when board type changes
  React.useEffect(() => {
    setColumns(DEFAULT_COLUMNS[type]);
  }, [type]);

  const next = () => setStep((s) => Math.min(s + 1, steps.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const handleAddColumn = () => setColumns([...columns, { name: '' }]);
  const handleRemoveColumn = (idx: number) => setColumns(columns.filter((_, i) => i !== idx));
  const handleColumnNameChange = (idx: number, value: string) => setColumns(columns.map((col, i) => i === idx ? { ...col, name: value } : col));

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string;
    const idx = parseInt(id.replace('col-', ''), 10);
    setActiveIndex(idx);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveIndex(null);

    if (over && active.id !== over.id) {
      const oldIndex = parseInt((active.id as string).replace('col-', ''), 10);
      const newIndex = parseInt((over.id as string).replace('col-', ''), 10);
      setColumns(arrayMove(columns, oldIndex, newIndex));
    }
  }

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

  const activeColumn = activeIndex !== null ? columns[activeIndex] : null;

  return (
    <Modal open={open} onClose={onClose} title="Create Board" maxWidthClass="sm:max-w-2xl">
      {/* Stepper Bar */}
      <div className="mb-8">
        <ol className="flex items-center w-full space-x-4">
          {steps.map((label, idx) => (
            <li key={label} className="flex-1 flex flex-col items-center">
              <div className={`w-8 h-8 flex items-center justify-center rounded-full border-2 font-bold text-sm transition-all duration-300 ${step === idx ? 'bg-blue-500 text-white border-blue-500 scale-110 shadow-lg' : step > idx ? 'bg-blue-100 dark:bg-blue-900 text-blue-500 border-blue-400' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 border-neutral-300 dark:border-neutral-700'}`}>{idx + 1}</div>
              <span className={`mt-2 text-xs font-semibold transition-colors ${step === idx ? 'text-blue-600 dark:text-blue-300' : 'text-neutral-400 dark:text-neutral-500'}`}>{label}</span>
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
                className={`flex-1 rounded-2xl border-2 p-6 flex flex-col items-center gap-2 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 ${type === 'scrum' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-blue-300'}`}
                aria-label="Select Scrum Board"
              >
                <div className="flex items-center gap-2">
                  <Squares2X2Icon className="h-8 w-8 text-blue-500" />
                  <span className="relative group">
                    <InformationCircleIcon className="h-5 w-5 text-neutral-400 hover:text-blue-500 ml-1" aria-hidden="true" />
                    <span className="absolute left-1/2 -translate-x-1/2 mt-2 w-48 bg-white dark:bg-neutral-900 text-xs text-neutral-700 dark:text-neutral-200 rounded-lg shadow-lg px-3 py-2 opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity duration-200">
                      Scrum boards are for sprint-based, iterative work. Plan, track, and complete work in time-boxed sprints.
                    </span>
                  </span>
                </div>
                <span className="font-bold">Scrum Board</span>
                <span className="text-xs text-neutral-500">Sprint-based, iterative work</span>
              </button>
              <button
                type="button"
                onClick={() => setType('kanban')}
                className={`flex-1 rounded-2xl border-2 p-6 flex flex-col items-center gap-2 transition-all focus:outline-none focus:ring-2 focus:ring-purple-400 ${type === 'kanban' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-blue-300'}`}
                aria-label="Select Kanban Board"
              >
                <div className="flex items-center gap-2">
                  <RectangleStackIcon className="h-8 w-8 text-purple-500" />
                  <span className="relative group">
                    <InformationCircleIcon className="h-5 w-5 text-neutral-400 hover:text-purple-500 ml-1" aria-hidden="true" />
                    <span className="absolute left-1/2 -translate-x-1/2 mt-2 w-48 bg-white dark:bg-neutral-900 text-xs text-neutral-700 dark:text-neutral-200 rounded-lg shadow-lg px-3 py-2 opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity duration-200">
                      Kanban boards are for continuous flow. Move work items through flexible stages at your own pace.
                    </span>
                  </span>
                </div>
                <span className="font-bold">Kanban Board</span>
                <span className="text-xs text-neutral-500">Continuous flow, flexible</span>
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
              <div className="text-xs text-neutral-500">Project: <span className="font-semibold text-neutral-700 dark:text-neutral-200">{defaultProjectName}</span></div>
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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={columns.map((_, idx) => `col-${idx}`)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {columns.map((col, idx) => (
                    <SortableWizardColumn
                      key={`col-${idx}`}
                      column={col}
                      index={idx}
                      onNameChange={(value) => handleColumnNameChange(idx, value)}
                      onRemove={() => handleRemoveColumn(idx)}
                    />
                  ))}
                </div>
              </SortableContext>

              <DragOverlay dropAnimation={{
                duration: 250,
                easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
              }}>
                {activeColumn ? <DragOverlayWizardColumn column={activeColumn} /> : null}
              </DragOverlay>
            </DndContext>

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
                <div className="text-neutral-600 dark:text-neutral-300">{description}</div>
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