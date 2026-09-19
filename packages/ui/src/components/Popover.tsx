import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HTMLAttributes, KeyboardEvent, ReactNode, Ref } from 'react';
import { cx } from '../internal/cx';

// useLayoutEffect warns on the server; the guard keeps SSR quiet while the flip
// measurement still lands before the browser's first paint.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface PopoverProps extends HTMLAttributes<HTMLDivElement> {
  /** Controlled open state. When false nothing is rendered. */
  open: boolean;
  /** Called when the popover should close: Escape, outside pointerdown, or Tab. */
  onClose: () => void;
  /** Accessible name when no visible trigger labels the popover. */
  label?: string;
  /** Open the panel above the anchor instead of below (auto-flips if it would overflow). */
  flip?: boolean;
  children?: ReactNode;
}

/**
 * Non-modal anchored panel: role="dialog" with aria-modal="false", Escape and
 * outside-pointerdown close, focus moved in on open and restored on close. No
 * animation by design.
 */
export const Popover = /* @__PURE__ */ forwardRef(function Popover(
  { open, onClose, label, flip = false, className, onKeyDown, children, ...rest }: PopoverProps,
  forwardedRef: Ref<HTMLDivElement>
) {
  const internalRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [above, setAbove] = useState(flip);

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      if (typeof document !== 'undefined' && document.activeElement === document.body) {
        restoreRef.current?.focus?.();
      }
      setAbove(flip);
      return;
    }
    if (typeof document !== 'undefined') {
      restoreRef.current = document.activeElement as HTMLElement | null;
    }
    const el = internalRef.current;
    let openingAbove = flip;
    if (el && typeof window !== 'undefined') {
      const r = el.getBoundingClientRect();
      const anchor = el.closest('.ui-popover-anchor');
      if (anchor && r.height > 0) {
        const a = anchor.getBoundingClientRect();
        const gap = 4; // mirrors the --ui-space-1 offset in popover.css
        const fitsBelow = window.innerHeight - a.bottom >= r.height + gap;
        const fitsAbove = a.top - gap >= r.height;
        openingAbove = !fitsBelow && fitsAbove;
      }
    }
    setAbove(openingAbove);
    internalRef.current?.focus();
  }, [open, flip]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const onPointerDown = (e: Event) => {
      const el = internalRef.current;
      if (!el) return;
      const boundary = el.closest('.ui-popover-anchor') ?? el;
      if (!boundary.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, onClose]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (e.key === 'Escape') {
      // contain the event: a Popover nested in a Dialog must close alone, and the
      // Dialog's document-level listener must not see this Escape
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      onClose();
    } else if (e.key === 'Tab') {
      // non-modal: let focus leave naturally; the popover just stops being open
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      ref={(el) => {
        internalRef.current = el;
        if (typeof forwardedRef === 'function') forwardedRef(el);
        else if (forwardedRef) (forwardedRef as { current: HTMLDivElement | null }).current = el;
      }}
      role="dialog"
      aria-modal="false"
      aria-label={label}
      tabIndex={-1}
      className={cx('ui-popover', above && 'ui-popover--above', className)}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
});
