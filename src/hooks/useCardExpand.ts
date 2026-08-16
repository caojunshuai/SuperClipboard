import { useEffect, useState } from 'react';
import type { MouseEvent, RefObject } from 'react';

// Expanded state + scroll-aware auto-collapse: when an expanded card scrolls
// past the viewport edge, collapse it and surface a floating collapse button
export function useCardExpand(cardRef: RefObject<HTMLDivElement>) {
  const [expanded, setExpanded] = useState(false);
  const [floatingCollapse, setFloatingCollapse] = useState(false);

  useEffect(() => {
    if (!expanded) {
      setFloatingCollapse(false);
      return;
    }

    const card = cardRef.current;
    if (!card) return;

    const scrollParent = card.closest('.overflow-y-auto') as HTMLElement | null;
    if (!scrollParent) return;

    const onScroll = () => {
      const cr = card.getBoundingClientRect();
      const sr = scrollParent.getBoundingClientRect();

      if (cr.bottom < sr.top) {
        setExpanded(false);
        return;
      }

      setFloatingCollapse(cr.bottom > sr.bottom + 4);
    };

    const raf = requestAnimationFrame(onScroll);
    scrollParent.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      scrollParent.removeEventListener('scroll', onScroll);
    };
  }, [expanded]);

  const collapse = (e: MouseEvent) => {
    e.stopPropagation();
    cardRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
    setExpanded(false);
  };

  return { expanded, setExpanded, floatingCollapse, collapse };
}
