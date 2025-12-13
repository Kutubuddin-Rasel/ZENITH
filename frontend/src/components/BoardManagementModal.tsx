import React, { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Typography from './Typography';
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
import { Cog6ToothIcon, Bars3Icon, PencilSquareIcon, TrashIcon, PlusIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

export interface BoardColumn {
  id: string;
  name: string; // Linear-style: column name IS the status
  columnOrder: number;
}

interface BoardManagementModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  boardId?: string;
  columns: BoardColumn[];
  boardName: string;
  onBoardRename: (name: string) => Promise<void>;
  onBoardDelete: () => Promise<void>;
  onColumnAdd: (name: string) => Promise<void>;
  onColumnEdit: (columnId: string, name: string) => Promise<void>;
  onColumnDelete: (columnId: string) => Promise<void>;
  onColumnsReorder: (orderedIds: string[]) => Promise<void>;
}

// Sortable Column Item
function SortableColumnItem({
  column,
  isEditing,
  editingName,
  onEditingNameChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete
}: {
  column: BoardColumn;
  isEditing: boolean;
  editingName: string;
  onEditingNameChange: (name: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-md bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 p-3 transition-colors ${isDragging ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/20 shadow-lg' : 'hover:bg-neutral-100 dark:hover:bg-neutral-600'
        }`}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
      >
        <Bars3Icon className="h-5 w-5" />
      </span>
      {isEditing ? (
        <>
          <Input
            value={editingName}
            onChange={e => onEditingNameChange(e.target.value)}
            className="flex-1"
          />
          <Button size="sm" onClick={onSaveEdit} variant="primary">
            <CheckIcon className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="secondary" onClick={onCancelEdit}>
            <XMarkIcon className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          <Typography variant="body" className="flex-1 text-neutral-900 dark:text-neutral-100">
            {column.name}
          </Typography>
          <Button size="sm" variant="secondary" onClick={onStartEdit}>
            <PencilSquareIcon className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="danger" onClick={onDelete}>
            <TrashIcon className="h-4 w-4" />
          </Button>
        </>
      )}
    </li>
  );
}

// Drag Overlay for Column
function DragOverlayColumn({ column }: { column: BoardColumn }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-white dark:bg-neutral-700 border-2 border-blue-500 p-3 shadow-2xl">
      <Bars3Icon className="h-5 w-5 text-neutral-400" />
      <Typography variant="body" className="flex-1 text-neutral-900 dark:text-neutral-100 font-medium">
        {column.name}
      </Typography>
    </div>
  );
}

const BoardManagementModal: React.FC<BoardManagementModalProps> = ({
  open, onClose, columns, boardName,
  onBoardRename, onBoardDelete, onColumnAdd, onColumnEdit, onColumnDelete, onColumnsReorder
}) => {
  const [editingBoardName, setEditingBoardName] = useState(boardName);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [addingCol, setAddingCol] = useState(false);
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingColName, setEditingColName] = useState('');
  const [localCols, setLocalCols] = useState(columns);
  const [activeId, setActiveId] = useState<string | null>(null);

  const COMMON_COLUMN_NAMES = [
    'To Do',
    'In Progress',
    'In Review',
    'Ready for QA',
    'Blocked',
    'Done',
    'Testing',
    'Closed',
    'On Hold',
  ];
  const [colNameMode, setColNameMode] = useState<'dropdown' | 'custom'>("dropdown");
  const [dropdownColName, setDropdownColName] = useState(COMMON_COLUMN_NAMES[0]);

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

  React.useEffect(() => { setLocalCols(columns); }, [columns]);

  const handleRename = async () => {
    setRenaming(true);
    await onBoardRename(editingBoardName);
    setRenaming(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    await onBoardDelete();
    setDeleting(false);
  };

  const handleAddCol = async () => {
    setAddingCol(true);
    const name = colNameMode === 'dropdown' ? dropdownColName : newColName;
    await onColumnAdd(name);
    setNewColName('');
    setDropdownColName(COMMON_COLUMN_NAMES[0]);
    setColNameMode('dropdown');
    setAddingCol(false);
  };

  const handleEditCol = async (colId: string) => {
    await onColumnEdit(colId, editingColName);
    setEditingColId(null);
    setEditingColName('');
  };

  const handleDeleteCol = async (colId: string) => {
    await onColumnDelete(colId);
  };

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = localCols.findIndex(c => c.id === active.id);
      const newIndex = localCols.findIndex(c => c.id === over.id);
      const reordered = arrayMove(localCols, oldIndex, newIndex);
      setLocalCols(reordered);
      await onColumnsReorder(reordered.map(c => c.id));
    }
  }

  const activeColumn = activeId ? localCols.find(c => c.id === activeId) : null;

  return (
    <Modal open={open} onClose={onClose} title={
      <div className="flex items-center gap-2">
        <Cog6ToothIcon className="h-6 w-6 text-neutral-600 dark:text-neutral-400" />
        <Typography variant="h2" className="text-neutral-900 dark:text-white">
          Manage Board
        </Typography>
      </div>
    }>
      <div className="space-y-6">
        {/* Board rename/delete */}
        <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6">
          <Typography variant="label" className="text-neutral-700 dark:text-neutral-300 mb-3">
            Board Name
          </Typography>
          <div className="flex gap-3 items-center">
            <Input
              value={editingBoardName}
              onChange={e => setEditingBoardName(e.target.value)}
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={handleRename}
              loading={renaming}
              disabled={renaming}
              variant="primary"
            >
              <PencilSquareIcon className="h-4 w-4 mr-1" />
              Rename
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={handleDelete}
              loading={deleting}
              disabled={deleting}
            >
              <TrashIcon className="h-4 w-4 mr-1" />
              Delete Board
            </Button>
          </div>
        </div>

        {/* Columns management */}
        <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Typography variant="h3" className="text-neutral-900 dark:text-white">
              Columns
            </Typography>
            <PlusIcon className="h-4 w-4 text-neutral-500" />
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={localCols.map(c => c.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {localCols.map((col) => (
                  <SortableColumnItem
                    key={col.id}
                    column={col}
                    isEditing={editingColId === col.id}
                    editingName={editingColName}
                    onEditingNameChange={setEditingColName}
                    onStartEdit={() => { setEditingColId(col.id); setEditingColName(col.name); }}
                    onSaveEdit={() => handleEditCol(col.id)}
                    onCancelEdit={() => setEditingColId(null)}
                    onDelete={() => handleDeleteCol(col.id)}
                  />
                ))}
              </ul>
            </SortableContext>

            <DragOverlay dropAnimation={{
              duration: 250,
              easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
            }}>
              {activeColumn ? <DragOverlayColumn column={activeColumn} /> : null}
            </DragOverlay>
          </DndContext>

          {/* Add new column */}
          <form onSubmit={e => { e.preventDefault(); handleAddCol(); }} className="flex gap-3 mt-6 items-center">
            <select
              className="flex-1 px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
              value={colNameMode === 'dropdown' ? dropdownColName : 'custom'}
              onChange={e => {
                if (e.target.value === 'custom') {
                  setColNameMode('custom');
                  setDropdownColName(COMMON_COLUMN_NAMES[0]);
                } else {
                  setColNameMode('dropdown');
                  setDropdownColName(e.target.value);
                }
              }}
            >
              {COMMON_COLUMN_NAMES.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
              <option value="custom">Custom...</option>
            </select>
            {colNameMode === 'custom' && (
              <Input
                value={newColName}
                onChange={e => setNewColName(e.target.value)}
                placeholder="Custom column name"
                className="flex-1"
                required
              />
            )}
            <Button
              type="submit"
              size="sm"
              loading={addingCol}
              disabled={addingCol || (colNameMode === 'custom' && !newColName.trim())}
              variant="primary"
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              Add Column
            </Button>
          </form>
        </div>
      </div>
    </Modal>
  );
};

export default BoardManagementModal;