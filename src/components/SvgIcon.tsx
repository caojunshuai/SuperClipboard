import { useRef, useEffect } from 'react';

interface Props {
  raw: string;
  className?: string;
  /** Keep the SVG's original fill colors instead of forcing currentColor. */
  keepFill?: boolean;
}

/** Render a raw SVG string inline. By default replaces fill with currentColor for CSS color inheritance. */
export default function SvgIcon({ raw, className, keepFill }: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const svg = el.querySelector('svg');
    if (!svg) return;

    if (!keepFill) {
      svg.removeAttribute('fill');
      svg.querySelectorAll('[fill]').forEach(e => e.removeAttribute('fill'));
      svg.setAttribute('fill', 'currentColor');
    }
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.display = 'block';
  }, [raw, keepFill]);

  return (
    <span
      ref={ref}
      className={className}
      dangerouslySetInnerHTML={{ __html: raw }}
    />
  );
}
