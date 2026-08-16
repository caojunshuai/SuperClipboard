import { useState, useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { updateNote } from '../api';
import type { ClipboardItem } from '../types';

// Note editing flow: draft state, sync with item, save with revert-on-failure
export function useNoteEdit(item: ClipboardItem) {
  const [note, setNote] = useState(item.note || '');
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const noteInputRef = useRef<HTMLInputElement>(null);

  // Sync note when item changes
  useEffect(() => {
    setNote(item.note || '');
  }, [item.note]);

  // Fill draft + focus when entering edit mode
  useEffect(() => {
    if (editingNote) {
      setNoteDraft(note);
      noteInputRef.current?.focus();
    }
  }, [editingNote]);

  const save = async () => {
    const trimmed = noteDraft.trim();
    const newNote = trimmed || null;
    setNote(trimmed);
    setEditingNote(false);
    try {
      await updateNote(item.id, trimmed || null);
    } catch {
      // revert on failure
      setNote(note);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      setEditingNote(false);
    }
  };

  return { note, editingNote, setEditingNote, noteDraft, setNoteDraft, noteInputRef, save, handleKeyDown };
}
