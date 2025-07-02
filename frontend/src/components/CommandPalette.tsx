import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import Input from './Input';
import Spinner from './Spinner';

// Types for commands
export type CommandItem = {
  id: string;
  label: string;
  type: 'project' | 'issue' | 'action';
  onSelect: () => void;
  icon?: React.ReactNode;
  description?: string;
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
  loading?: boolean;
}

export default function CommandPalette({ open, onClose, items, loading }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fuzzy filter (simple for now)
  const filtered = query
    ? items.filter(i => i.label.toLowerCase().includes(query.toLowerCase()))
    : items;

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        setSelected(s => Math.min(s + 1, filtered.length - 1));
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        setSelected(s => Math.max(s - 1, 0));
        e.preventDefault();
      } else if (e.key === 'Enter') {
        filtered[selected]?.onSelect();
        onClose();
      } else if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, filtered, selected, onClose]);

  return (
    <Modal open={open} onClose={onClose}>
      <div className="w-full max-w-lg mx-auto bg-white dark:bg-background-dark rounded-lg shadow-lg p-4">
        <Input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Type a command, project, or issue..."
          className="mb-3"
        />
        {loading ? (
          <div className="flex justify-center py-8"><Spinner className="h-6 w-6" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-400 text-center py-8">No results.</div>
        ) : (
          <ul>
            {filtered.map((item, i) => (
              <li
                key={item.id}
                className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors ${i === selected ? 'bg-accent-blue/10' : ''}`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => { item.onSelect(); onClose(); }}
              >
                {item.icon && <span>{item.icon}</span>}
                <span className="font-medium">{item.label}</span>
                {item.description && <span className="text-xs text-gray-500 ml-2">{item.description}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 text-xs text-gray-400 text-center">Use <kbd>↑</kbd>/<kbd>↓</kbd> to navigate, <kbd>Enter</kbd> to select, <kbd>Esc</kbd> to close.</div>
      </div>
    </Modal>
  );
} 