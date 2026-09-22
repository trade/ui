// SPDX-License-Identifier: MIT OR Apache-2.0

import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cx } from '../internal/cx';
import type { Density } from './Stack';

export interface TabItem {
  key: string;
  label: ReactNode;
  content?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (key: string) => void;
  density?: Density;
  className?: string;
}

/** ARIA tabs with roving tabindex: the list is a single Tab stop; ←/→ move between tabs. */
export function Tabs({ items, value, defaultValue, onChange, density, className }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue ?? items[0]?.key);
  const active = value ?? internal;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();

  const select = (key: string) => {
    if (value === undefined) setInternal(key);
    onChange?.(key);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const enabled = items.filter((i) => !i.disabled);
    if (enabled.length === 0) return;
    const currentKey = active;
    const idx = enabled.findIndex((i) => i.key === currentKey);
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % enabled.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    else return;
    e.preventDefault();
    const target = enabled[next];
    select(target.key);
    const targetIndex = items.findIndex((i) => i.key === target.key);
    refs.current[targetIndex]?.focus();
  };

  return (
    <div className={cx('ui-tabs', className)}>
      <div className="ui-tabs__list" role="tablist">
        {items.map((item, i) => {
          const selected = item.key === active;
          return (
            <button
              key={item.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.key}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.key}`}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              className="ui-tab"
              data-density={density}
              onClick={() => select(item.key)}
              onKeyDown={onKeyDown}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => {
        const selected = item.key === active;
        return (
          <div
            key={item.key}
            className="ui-tabs__panel"
            role="tabpanel"
            id={`${baseId}-panel-${item.key}`}
            aria-labelledby={`${baseId}-tab-${item.key}`}
            hidden={!selected}
            tabIndex={selected ? 0 : undefined}
          >
            {item.content}
          </div>
        );
      })}
    </div>
  );
}
