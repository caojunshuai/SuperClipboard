import { forwardRef } from 'react';

interface Props {
  children: React.ReactNode;
  className?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
}

const ScrollArea = forwardRef<HTMLDivElement, Props>(
  ({ children, className = '', onKeyDown }, ref) => {
    return (
      <div
        ref={ref}
        tabIndex={onKeyDown ? 0 : undefined}
        onKeyDown={onKeyDown}
        className={`flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin outline-none focus-visible:outline-none ${className}`}
      >
        {children}
      </div>
    );
  }
);

ScrollArea.displayName = 'ScrollArea';

export default ScrollArea;
