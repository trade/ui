import { forwardRef, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ChangeEvent, ForwardRefExoticComponent, KeyboardEvent, ReactNode, Ref, RefAttributes, SelectHTMLAttributes } from 'react';
import { cx } from '../internal/cx';
import type { Density } from './Stack';

// useLayoutEffect warns on the server; the guard keeps SSR quiet while the flip
// measurement still lands before the browser's first paint.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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
  /**
   * 'native' (default) renders a native <select>. 'listbox' renders the hand-rolled
   * select-only combobox: same options/value/onChange API (onChange receives
   * `{ target: { value } }` like the native variant, so consumer code does not branch),
   * aria-activedescendant navigation, typeahead, flip when the panel would overflow.
   * Field-style id/aria wiring passed to the component is forwarded to the trigger.
   * Unlike the native variant it does not participate in HTML constraint validation
   * (a hidden input cannot be validated); it carries the value for submission when
   * `name` is set, and mirrors the disabled state onto that input.
   */
  variant?: 'native' | 'listbox';
}

/**
 * The listbox variant shares the native variant's onChange event shape so consumer
 * handlers never branch on the variant; the adapter documents that contract.
 */
function emitValueChange(
  onChange: SelectProps['onChange'] | undefined,
  value: string,
  name: string | undefined
) {
  onChange?.({ target: { value, name } } as unknown as ChangeEvent<HTMLSelectElement>);
}

const TYPEAHEAD_RESET_MS = 500;

function SelectListbox({
  options,
  placeholder,
  invalid = false,
  density,
  listboxId,
  value: rawValue,
  defaultValue: rawDefault,
  name,
  onChange,
  disabled,
  id,
  'aria-describedby': describedBy,
  className,
  triggerRef,
  // the trigger owns click/keydown (open, navigation, typeahead); consumer handlers
  // keep working via the wrapper, which the events bubble through
  onClick,
  onKeyDown,
  // select-only attributes: required is surfaced as aria-required; the listbox
  // variant is single-select, so `multiple` is accepted and ignored
  multiple,
  required,
  ...rest
}: Omit<SelectProps, 'variant'> & { listboxId: string; triggerRef: Ref<HTMLButtonElement> }) {
  const valueProp = rawValue != null ? String(rawValue) : undefined;
  const defaultValue = rawDefault != null ? String(rawDefault) : undefined;
  // every select-only prop is extracted above (value/onChange/name/onClick/onKeyDown/
  // multiple/required); what survives is generic element attribute surface, so this cast
  // documents the boundary rather than papering over a real conflict.
  const buttonRest = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');
  const [active, setActive] = useState(-1);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const typeahead = useRef({ buffer: '', at: 0 });

  const selected = valueProp !== undefined ? valueProp : internalValue;
  const enabledIndexes = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const selectedIdx = options.findIndex((o) => o.value === selected);
  const triggerId = id ?? `${listboxId}-trigger`;

  const step = (from: number, dir: 1 | -1) => {
    const pool = enabledIndexes;
    if (pool.length === 0) return from;
    const pos = pool.indexOf(from);
    return pool[(((pos === -1 ? 0 : pos) + dir) % pool.length + pool.length) % pool.length];
  };

  const openPanel = (initial?: number) => {
    const start = enabledIndexes.includes(selectedIdx) ? selectedIdx : enabledIndexes[0] ?? -1;
    setActive(initial ?? start);
    setOpen(true);
  };

  const commit = (idx: number) => {
    const opt = options[idx];
    if (!opt || opt.disabled) return;
    setInternalValue(opt.value);
    emitValueChange(onChange, opt.value, name);
    setOpen(false);
  };

  const typeaheadMatch = (char: string) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const state = typeahead.current;
    state.buffer = now - state.at > TYPEAHEAD_RESET_MS ? char : state.buffer + char;
    state.at = now;
    const buf = state.buffer.toLowerCase();
    const pool = enabledIndexes.length ? enabledIndexes : options.map((_, i) => i);
    const start = active;
    for (let n = 1; n <= pool.length; n++) {
      const idx = pool[(((start === -1 ? 0 : pool.indexOf(start)) + n) % pool.length + pool.length) % pool.length];
      if (options[idx]?.label.toLowerCase().startsWith(buf)) return idx;
    }
    return -1;
  };

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openPanel();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPanel();
      } else if (e.key.length === 1) {
        const idx = typeaheadMatch(e.key);
        if (idx >= 0) commit(idx);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => step(a, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => step(a, -1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(enabledIndexes[0] ?? -1);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(enabledIndexes[enabledIndexes.length - 1] ?? -1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit(active);
    } else if (e.key === 'Escape') {
      // stop the surrounding Dialog/Popover from closing with us
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (e.key.length === 1) {
      const idx = typeaheadMatch(e.key);
      if (idx >= 0) setActive(idx);
    }
  };

  // flip above the trigger when the panel would overflow the viewport
  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setAbove(false);
      return;
    }
    const el = panelRef.current;
    if (el && typeof window !== 'undefined') {
      const r = el.getBoundingClientRect();
      const anchor = el.closest('.ui-select-lb');
      if (anchor && r.height > 0) {
        const a = anchor.getBoundingClientRect();
        const gap = 4; // mirrors the --ui-space-1 offset in forms.css
        setAbove(window.innerHeight - a.bottom < r.height + gap && a.top - gap >= r.height);
      }
    }
  }, [open]);

  // keep the keyboard-active option inside the scrollable panel; scrollIntoView is
  // missing in some environments (jsdom), hence the optional call
  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector('.ui-select-lb__option--active')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const onPointerDown = (e: Event) => {
      const el = panelRef.current;
      if (!el) return;
      const boundary = el.closest('.ui-select-lb') ?? el;
      if (!boundary.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <span className={cx('ui-select-lb', className)} onClick={onClick} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listboxId}-opt-${active}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        disabled={disabled}
        className={cx(
          'ui-select',
          'ui-select-lb__trigger',
          density && density !== 'comfortable' && `ui-select--${density}`
        )}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={handleTriggerKeyDown}
        {...buttonRest}
      >
        <span className={cx('ui-select-lb__label', selectedIdx === -1 && 'ui-select-lb__label--placeholder')}>
          {selectedIdx >= 0 ? options[selectedIdx].label : placeholder}
        </span>
        <span className="ui-select-lb__chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {name ? <input type="hidden" name={name} value={selected} disabled={disabled} /> : null}
      {open ? (
        <div
          ref={panelRef}
          role="listbox"
          id={listboxId}
          aria-labelledby={triggerId}
          className={cx('ui-select-lb__panel', above && 'ui-select-lb__panel--above')}
        >
          {options.map((o, i) => (
            <div
              key={o.value}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={o.value === selected}
              aria-disabled={o.disabled || undefined}
              className={cx('ui-select-lb__option', i === active && 'ui-select-lb__option--active')}
              onClick={() => commit(i)}
            >
              {o.label}
            </div>
          ))}
        </div>
      ) : null}
    </span>
  );
}

// The overload keeps the two DOM shapes honest: without `variant` the ref is the same
// HTMLSelectElement it always was; with variant="listbox" the ref is the trigger button.
type SelectComponent = ForwardRefExoticComponent<
  Omit<SelectProps, 'variant'> & { variant?: 'native' } & RefAttributes<HTMLSelectElement>
> &
  ForwardRefExoticComponent<
    Omit<SelectProps, 'variant'> & { variant: 'listbox' } & RefAttributes<HTMLButtonElement>
  >;

function SelectImpl(
  { options, placeholder, density, invalid = false, variant = 'native', className, ...rest }: SelectProps,
  ref: Ref<HTMLSelectElement | HTMLButtonElement>
) {
  const autoId = useId();
  if (variant === 'listbox') {
    return (
      <SelectListbox
        {...rest}
        options={options}
        placeholder={placeholder}
        invalid={invalid}
        density={density}
        listboxId={`ui-select-lb-${autoId}`}
        className={className}
        triggerRef={ref as Ref<HTMLButtonElement>}
      />
    );
  }
  return (
    <select
      ref={ref as Ref<HTMLSelectElement>}
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
}

export const Select = /* @__PURE__ */ forwardRef(SelectImpl) as unknown as SelectComponent;
