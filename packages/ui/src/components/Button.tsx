// SPDX-License-Identifier: MIT OR Apache-2.0
// SPDX-FileCopyrightText: 2019-present Iko <6572003+iap@users.noreply.github.com>

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../internal/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonDensity = 'comfortable' | 'compact' | 'dense';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  density?: ButtonDensity;
  fullWidth?: boolean;
  loading?: boolean;
  children?: ReactNode;
}

/** Button. No ripple, no transitions — state changes are instant. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    density,
    fullWidth = false,
    loading = false,
    disabled,
    className,
    type = 'button',
    children,
    ...rest
  },
  ref
) {
  const cls = cx(
    'ui-btn',
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    density && density !== 'comfortable' && `ui-btn--${density}`,
    fullWidth && 'ui-btn--full',
    loading && 'ui-btn--loading',
    className
  );

  return (
    <button
      ref={ref}
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {children}
    </button>
  );
});
