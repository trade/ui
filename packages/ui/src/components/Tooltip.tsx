// SPDX-License-Identifier: MIT OR Apache-2.0
// SPDX-FileCopyrightText: 2019-present Iko <6572003+iap@users.noreply.github.com>

import { cloneElement, forwardRef, isValidElement, useId, useState } from 'react';
import type { HTMLAttributes, KeyboardEvent, ReactElement, ReactNode, Ref } from 'react';
import { cx } from '../internal/cx';

export interface TooltipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** The tooltip content. Rendered inside a role="tooltip" element. */
  label: ReactNode;
  /** Which side of the trigger the tooltip appears on. */
  placement?: 'top' | 'bottom';
  /** The single element that triggers the tooltip on hover and keyboard focus. */
  children: ReactNode;
}

/**
 * Hover/focus tooltip. Shows instantly on pointer enter or keyboard focus (no
 * delay, no animation by design), hides on leave, blur or Escape, and wires
 * aria-describedby onto the trigger while visible.
 */
export const Tooltip = /* @__PURE__ */ forwardRef(function Tooltip(
  { label, placement = 'top', className, children, onMouseEnter, onMouseLeave, onFocus, onBlur, onKeyDown: consumerOnKeyDown, ...rest }: TooltipProps,
  ref: Ref<HTMLSpanElement>
) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [hiddenByEscape, setHiddenByEscape] = useState(false);

  const show = () => {
    setHiddenByEscape(false);
    setOpen(true);
  };
  const hide = () => setOpen(false);

  // internal show/hide/Escape contract composes with consumer handlers — the
  // extracted props must never fall through to {...rest}, which would overwrite
  // the internal behavior (greptile P1, proven by execution on PR #25)
  const handleKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setHiddenByEscape(true);
      setOpen(false);
    }
    consumerOnKeyDown?.(e);
  };

  return (
    <span
      ref={ref}
      className={cx('ui-tooltip-anchor', className)}
      onMouseEnter={(e) => { show(); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { hide(); onMouseLeave?.(e); }}
      onFocus={(e) => { show(); onFocus?.(e); }}
      onBlur={(e) => { hide(); onBlur?.(e); }}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {isValidElement(children) && open
        ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, {
            'aria-describedby': [
              (children.props as { 'aria-describedby'?: string })['aria-describedby'],
              id
            ]
              .filter(Boolean)
              .join(' ')
          })
        : children}
      {open && !hiddenByEscape ? (
        <span role="tooltip" id={id} className={cx('ui-tooltip', placement === 'bottom' && 'ui-tooltip--bottom')}>
          {label}
        </span>
      ) : null}
    </span>
  );
});
