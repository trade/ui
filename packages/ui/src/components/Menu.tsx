import { forwardRef, useEffect, useRef, useState } from 'react';
import type { HTMLAttributes, KeyboardEvent, ReactNode, Ref } from 'react';
import { cx } from '../internal/cx';

export interface MenuItemProps extends HTMLAttributes<HTMLButtonElement> {
  disabled?: boolean;
  children?: ReactNode;
}

/** A single action inside a {@link Menu}. Renders a native button with role="menuitem". */
export const MenuItem = /* @__PURE__ */ forwardRef(function MenuItem(
  { disabled, className, children, ...rest }: MenuItemProps,
  ref: Ref<HTMLButtonElement>
) {
  return (
    <button ref={ref} type="button" role="menuitem" className={cx('ui-menuitem', className)} disabled={disabled} {...rest}>
      {children}
    </button>
  );
});

export interface MenuSeparatorProps extends HTMLAttributes<HTMLHRElement> {}

/** Visual separator between groups of menu items. */
export const MenuSeparator = /* @__PURE__ */ forwardRef(function MenuSeparator(
  { className, ...rest }: MenuSeparatorProps,
  ref: Ref<HTMLHRElement>
) {
  return <hr ref={ref} role="separator" className={cx('ui-menusep', className)} {...rest} />;
});

export interface MenuProps extends HTMLAttributes<HTMLDivElement> {
  /** Controlled open state. When false nothing is rendered. */
  open: boolean;
  /** Called when the menu should close: Escape, outside pointerdown, or Tab. */
  onClose: () => void;
  /** Accessible name when no visible trigger labels the menu. */
  label?: string;
  /** Open the panel above the anchor instead of below (auto-flips if it would overflow). */
  flip?: boolean;
  children?: ReactNode;
}

function MenuWithRef(
  { open, onClose, label, flip = false, className, onKeyDown, children, ...rest }: MenuProps,
  forwardedRef: Ref<HTMLDivElement>
) {
  const internalRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [above, setAbove] = useState(flip);

  // The focused item (never a disabled one), relative to the live DOM.
  const enabledItems = () =>
    Array.from(internalRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);

  // On open: remember the trigger, focus the first item, and flip above when the panel
  // would overflow the viewport below (real browsers only — jsdom reports zero rects).
  useEffect(() => {
    if (!open) return;
    if (typeof document !== 'undefined') {
      restoreRef.current = document.activeElement as HTMLElement | null;
    }
    const el = internalRef.current;
    let overflowing = false;
    if (el && typeof window !== 'undefined') {
      const r = el.getBoundingClientRect();
      overflowing = r.height > 0 && r.bottom > window.innerHeight && r.top - r.height >= 0;
    }
    setAbove(overflowing || flip);
    enabledItems()[0]?.focus();
  }, [open, flip]);

  // On close: give focus back to the trigger unless the pointer moved it elsewhere.
  useEffect(() => {
    if (open) return;
    if (typeof document !== 'undefined' && document.activeElement === document.body) {
      restoreRef.current?.focus?.();
    }
  }, [open]);

  // Outside pointerdown closes, wherever the click lands (law: keyboard and pointer
  // parity — Escape and Tab close from the keyboard below).
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const onPointerDown = (e: Event) => {
      const el = internalRef.current;
      if (el && !el.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, onClose]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    const items = enabledItems();
    if (items.length === 0) return;
    const current = items.findIndex((i) => i === document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(current + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(current <= 0 ? items.length - 1 : current - 1) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      // let focus leave naturally; the menu just stops being open
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
      role="menu"
      aria-label={label}
      className={cx('ui-menu', above && 'ui-menu--above', className)}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Anchored menu panel: role="menu", keyboard navigation, Escape/outside close. */
export const Menu = /* @__PURE__ */ forwardRef(MenuWithRef);
