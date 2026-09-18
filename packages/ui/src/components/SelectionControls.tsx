import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '../internal/cx';

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export interface CheckboxProps extends NativeProps {
  label?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, disabled, ...rest },
  ref
) {
  return (
    <label className={cx('ui-check', disabled && 'ui-check--disabled', className)}>
      <input ref={ref} type="checkbox" disabled={disabled} {...rest} />
      {label ? <span>{label}</span> : null}
    </label>
  );
});

export interface RadioProps extends NativeProps {
  label?: ReactNode;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, className, disabled, ...rest },
  ref
) {
  return (
    <label className={cx('ui-check', disabled && 'ui-check--disabled', className)}>
      <input ref={ref} type="radio" disabled={disabled} {...rest} />
      {label ? <span>{label}</span> : null}
    </label>
  );
});

export interface SwitchProps extends NativeProps {
  label?: ReactNode;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, className, disabled, ...rest },
  ref
) {
  return (
    <label className={cx('ui-switch', disabled && 'ui-check--disabled', className)}>
      <input ref={ref} type="checkbox" role="switch" disabled={disabled} {...rest} />
      {label ? <span>{label}</span> : null}
    </label>
  );
});
