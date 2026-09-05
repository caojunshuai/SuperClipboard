import { useState, useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { updateContent } from '../api';
import type { ClipboardItem } from '../types';

// Text content editing flow: inline edit state, display sync, save with
// cross-row dedup (merge → parent removes card), revert on failure
export function useContentEdit(item: ClipboardItem, onDelete: (id: number) => void) {
  const [editingContent, setEditingContent] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [displayContent, setDisplayContent] = useState(item.content || '');
  const [displayCreatedAt, setDisplayCreatedAt] = useState(item.created_at);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync display when item changes
  useEffect(() => {
    setDisplayContent(item.content || '');
  }, [item.content]);

  useEffect(() => {
    setDisplayCreatedAt(item.created_at);
  }, [item.created_at]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (editingContent) {
      setEditDraft(displayContent);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [editingContent]);

  const save = async () => {
    setEditingContent(false);
    try {
      const newCreatedAt = await updateContent(item.id, editDraft);
      if (newCreatedAt) {
        // Normal update — refresh local display
        setDisplayContent(editDraft);
        setDisplayCreatedAt(newCreatedAt);
      } else {
        // Merged into an existing duplicate — remove this card
        onDelete(item.id);
      }
    } catch {
      setDisplayContent(item.content || '');
    }
  };

  const cancel = () => setEditingContent(false);

  const handleKeyDown = (e: KeyboardEvent) => {
    // Editing keys belong to the input — keep them off the list shortcuts
    e.stopPropagation();
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      cancel();
    }
  };

  const startEdit = () => setEditingContent(true);

  return {
    editingContent, editDraft, setEditDraft,
    displayContent, displayCreatedAt, textareaRef,
    startEdit, save, cancel, handleKeyDown,
  };
}
