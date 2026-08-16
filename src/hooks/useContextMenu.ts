import { useState, useEffect, useCallback } from 'react';

export interface ContextMenuPos {
  left: number;
  top: number;
}

interface Options {
  /** Selector for items inside the menu — clicks on them don't dismiss. */
  menuItemClass: string;
}

/**
 * Position + dismiss logic for a right-click context menu.
 * openAt flips the menu when it would overflow the window; any mousedown
 * outside the menu (i.e. not matching menuItemClass) closes it.
 */
export function useContextMenu({ menuItemClass }: Options) {
  const [pos, setPos] = useState<ContextMenuPos | null>(null);

  // Dismiss on outside click
  useEffect(() => {
    if (!pos) return;
    const dismiss = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(menuItemClass)) return;
      setPos(null);
    };
    window.addEventListener('mousedown', dismiss);
    return () => window.removeEventListener('mousedown', dismiss);
  }, [pos, menuItemClass]);

  const openAt = useCallback((clientX: number, clientY: number, estW = 90, estH = 100) => {
    const flipX = clientX + estW > window.innerWidth;
    const flipY = clientY + estH > window.innerHeight;
    setPos({
      left: flipX ? clientX - estW : clientX,
      top: flipY ? clientY - estH : clientY,
    });
  }, []);

  const close = useCallback(() => setPos(null), []);

  return { pos, openAt, close };
}
