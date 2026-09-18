import { forwardRef } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { cx } from '../internal/cx';
import type { Density } from './Stack';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: SelectOption[];
  placeholder?: ReactNode;
  density?: Density;
  invalid?: boolean;
}

/**
 * v1 is native-select backed on purpose: it is dependency-free, fully accessible and
 * consistent across browsers. A custom listbox can replace it behind the same API later.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, density, invalid = false, className, ...rest },
  ref
) {
  return (
    <select
      ref={ref}
      className={cx('ui-select', density && density !== 'comfortable' && `ui-select--${density}`, className)}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
});
