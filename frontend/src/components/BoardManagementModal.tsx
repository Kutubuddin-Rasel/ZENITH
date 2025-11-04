import React, { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import Typography from './Typography';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Cog6ToothIcon, Bars3Icon, PencilSquareIcon, TrashIcon, PlusIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

export interface BoardColumn {
  id: string;
  name: string;
  status: string;
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
  const [, setReordering] = useState(false);

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
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(localCols);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setLocalCols(reordered);
    setReordering(true);
    await onColumnsReorder(reordered.map(c => c.id));
    setReordering(false);
  };

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
          
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="columns">
              {(provided) => (
                <ul ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                  {localCols.map((col, idx) => (
                    <Draggable draggableId={col.id} index={idx} key={col.id}>
                      {(provided, snapshot) => (
                        <li
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`flex items-center gap-3 rounded-md bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 p-3 transition-colors ${snapshot.isDragging ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'hover:bg-neutral-100 dark:hover:bg-neutral-600'}`}
                        >
                          <span {...provided.dragHandleProps} className="cursor-grab text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors">
                            <Bars3Icon className="h-5 w-5" />
                          </span>
                          {editingColId === col.id ? (
                            <>
                              <Input 
                                value={editingColName} 
                                onChange={e => setEditingColName(e.target.value)} 
                                className="flex-1" 
                              />
                              <Button 
                                size="sm" 
                                onClick={() => handleEditCol(col.id)}
                                variant="primary"
                              >
                                <CheckIcon className="h-4 w-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="secondary" 
                                onClick={() => setEditingColId(null)}
                              >
                                <XMarkIcon className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Typography variant="body" className="flex-1 text-neutral-900 dark:text-neutral-100">
                                {col.name}
                              </Typography>
                              <Button 
                                size="sm" 
                                variant="secondary"
                                onClick={() => { setEditingColId(col.id); setEditingColName(col.name); }}
                              >
                                <PencilSquareIcon className="h-4 w-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="danger" 
                                onClick={() => handleDeleteCol(col.id)}
                              >
                                <TrashIcon className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </li>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </DragDropContext>

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