import { cloneElement, isValidElement, useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { cx } from '../internal/cx';

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** a single form control element; receives id + aria-* wiring */
  children: ReactElement<Record<string, unknown>>;
  className?: string;
}

/** Label + control + hint/error, with automatic id and aria wiring. */
export function Field({ label, hint, error, children, className }: FieldProps) {
  const reactId = useId();
  const controlId = `ui-field-${reactId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;

  // Preserve any aria-describedby the consumer set on the control and append Field's own
  // error/hint id rather than replacing it (Input and Tooltip merge; Field overwrote it).
  const existingDescribedBy = children.props['aria-describedby'] as string | undefined;
  const describedBy = [existingDescribedBy, errorId ?? hintId].filter(Boolean).join(' ') || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: (children.props.id as string | undefined) ?? controlId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined
      })
    : children;

  return (
    <div className={cx('ui-field', !!error && 'ui-field--error', className)}>
      {label ? (
        <label className="ui-field__label" htmlFor={(children.props.id as string | undefined) ?? controlId}>
          {label}
        </label>
      ) : null}
      {control}
      {error ? (
        <span className="ui-field__error" id={errorId}>
          {error}
        </span>
      ) : hint ? (
        <span className="ui-field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
