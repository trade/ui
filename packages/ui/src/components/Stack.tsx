import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cx } from '../internal/cx';

export type Density = 'comfortable' | 'compact' | 'dense';

const ALIGN = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' } as const;
const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' } as const;

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: 'row' | 'column';
  gap?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  align?: keyof typeof ALIGN;
  justify?: keyof typeof JUSTIFY;
  wrap?: boolean;
  grow?: boolean;
  children?: ReactNode;
}

/** Flex layout primitive. Spacing comes from the 8dp token scale. */
export function Stack({
  direction = 'column',
  gap = 3,
  align,
  justify,
  wrap = false,
  grow = false,
  className,
  style,
  children,
  ...rest
}: StackProps) {
  const cls = cx(
    'ui-stack',
    `ui-stack--${direction}`,
    wrap && 'ui-stack--wrap',
    grow && 'ui-stack--grow',
    className
  );
  const merged: CSSProperties = { gap: `var(--ui-space-${gap})`, ...style };
  if (align) merged.alignItems = ALIGN[align];
  if (justify) merged.justifyContent = JUSTIFY[justify];

  return (
    <div className={cls} style={merged} {...rest}>
      {children}
    </div>
  );
}
