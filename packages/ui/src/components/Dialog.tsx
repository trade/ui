import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../internal/cx';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  closeLabel?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog: scrim, Escape to close, scrim click to close, focus moved in on open
 * and restored on close, Tab cycled inside. No entry/exit animation by design.
 */
export function Dialog({ open, onClose, title, children, footer, className, closeLabel = 'Close' }: DialogProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<Element | null>(null);

  // Hold onClose in a ref and depend only on `open`. Depending on the onClose identity re-ran this
  // effect on every parent re-render (a consumer passing an inline handler creates a new identity
  // each render): the cleanup restored focus to the pre-open element and the body re-focused the
  // container, so focus inside the modal was reset to the dialog on every re-render and the
  // document keydown listener was torn down and re-added each render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = typeof document !== 'undefined' ? document.activeElement : null;
    // Move focus into the dialog. The container itself is the safest initial target:
    // focusing the first control can surprise users on destructive dialogs.
    ref.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const prev = previouslyFocused.current;
      if (prev && prev instanceof HTMLElement) prev.focus();
    };
  }, [open]);

  if (!open) return null;

  const onScrimMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !ref.current) return;
    const nodes = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (n) => !n.hasAttribute('disabled')
    );
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const content = (
    <div className="ui-dialog__scrim" onMouseDown={onScrimMouseDown}>
      <div
        ref={ref}
        className={cx('ui-dialog', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="ui-dialog__header">
          <h2 className="ui-dialog__title" id={titleId}>
            {title}
          </h2>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
        {children ? <div className="ui-dialog__body">{children}</div> : null}
        {footer ? <div className="ui-dialog__footer">{footer}</div> : null}
      </div>
    </div>
  );

  // In a browser the dialog is portalled to <body>; during SSR it renders inline so the
  // markup is still present in the string.
  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
}
