// SPDX-License-Identifier: MIT OR Apache-2.0

import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cx } from '../internal/cx';
import type { Density } from './Stack';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** right-aligned tabular figures — use for prices, quantities and P/L */
  numeric?: boolean;
  density?: Density;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { numeric = false, density, invalid = false, className, 'aria-describedby': describedBy, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      className={cx(
        'ui-input',
        numeric && 'ui-input--numeric',
        density && density !== 'comfortable' && `ui-input--${density}`,
        className
      )}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      {...rest}
    />
  );
});
