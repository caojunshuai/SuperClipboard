import { useEffect } from 'react';
import type { MouseEvent } from 'react';

interface UseModalOptions {
  /** Whether Escape closes the dialog. Defaults to true. */
  esc?: boolean;
  /** Custom Escape handler (e.g. multi-level confirm). Defaults to onClose. */
  onEscape?: () => void;
}

/**
 * Shared modal behaviors: backdrop click-to-close, inner-panel
 * stopPropagation, and optional Escape-to-close.
 */
export function useModal(onClose: () => void, options?: UseModalOptions) {
  const { esc = true, onEscape } = options ?? {};
  const handleEscape = onEscape ?? onClose;

  useEffect(() => {
    if (!esc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleEscape();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [esc, handleEscape]);

  return {
    /** Spread onto the backdrop div: closes on outside click. */
    backdropProps: { onClick: onClose },
    /** Spread onto the inner panel: keeps inside clicks from closing. */
    stopPropagation: (e: MouseEvent) => e.stopPropagation(),
  };
}
