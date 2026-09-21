import type { ReactNode, UIEvent } from 'react';
import { cx } from '../internal/cx';
import type { Density } from './Stack';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** fixed px width — keeps numeric columns from reflowing as values change */
  width?: number;
  numeric?: boolean;
  align?: 'start' | 'end';
  render?: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  getRowKey: (row: T, index: number) => string | number;
  density?: Density;
  /** full dataset size when rows are virtualized — keeps ARIA counts honest */
  rowCount?: number;
  /** index of the first supplied row within the full dataset, for virtualized windows */
  rowOffset?: number;
  /** row height in px. Supplying it with rowCount > rows.length turns on virtual spacers. */
  rowHeight?: number;
  /** forwarded to the scroll container, so a consumer can drive windowing */
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
  caption?: ReactNode;
  emptyMessage?: ReactNode;
  focusableRows?: boolean;
  onRowClick?: (row: T) => void;
  className?: string;
}

/**
 * Dense, virtualizer-friendly table.
 * Styling + ARIA live here; the consumer supplies whichever virtualizer it wants via `rows`.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  density,
  rowCount,
  rowOffset = 0,
  rowHeight,
  onScroll,
  caption,
  emptyMessage = 'No data',
  focusableRows = false,
  onRowClick,
  className
}: DataTableProps<T>) {
  const total = (rowCount ?? rows.length) + 1; // + header row
  // Virtualized windows: the consumer supplies only the visible slice plus rowHeight, and the
  // table reserves the space above and below so the scrollbar reflects the whole dataset.
  const virtualized = rowHeight !== undefined && rowCount !== undefined && rowCount > rows.length;
  const spacerBefore = virtualized ? rowOffset * rowHeight : 0;
  const spacerAfter = virtualized ? Math.max(0, rowCount - rowOffset - rows.length) * rowHeight : 0;

  return (
    <div className={cx('ui-table-wrap', className)} onScroll={onScroll} tabIndex={0}>
      <table
        className={cx('ui-table', density && density !== 'comfortable' && `ui-table--${density}`)}
        role="grid"
        aria-rowcount={total}
        aria-colcount={columns.length}
      >
        {caption ? <caption className="ui-table__caption">{caption}</caption> : null}
        <thead>
          <tr role="row" aria-rowindex={1}>
            {columns.map((c) => (
              <th
                key={c.key}
                role="columnheader"
                scope="col"
                className={cx(c.numeric && 'ui-cell--numeric')}
                style={c.width ? { width: c.width, minWidth: c.width } : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spacerBefore > 0 ? <tr aria-hidden="true" style={{ height: spacerBefore }} /> : null}
          {rows.length === 0 && !virtualized ? (
            <tr role="row" aria-rowindex={2}>
              <td
                className="ui-table__empty"
                role="gridcell"
                aria-colspan={columns.length}
                colSpan={columns.length}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={getRowKey(row, i)}
                role="row"
                aria-rowindex={rowOffset + i + 2}
                tabIndex={focusableRows ? 0 : undefined}
                data-focusable={focusableRows ? 'true' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    role="gridcell"
                    className={cx(
                      c.numeric && 'ui-cell--numeric',
                      c.align === 'end' && 'ui-cell--numeric'
                    )}
                    style={c.width ? { width: c.width, minWidth: c.width } : undefined}
                  >
                    {c.render ? c.render(row) : ((row as Record<string, unknown>)[c.key] as ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          )}
          {spacerAfter > 0 ? <tr aria-hidden="true" style={{ height: spacerAfter }} /> : null}
        </tbody>
      </table>
    </div>
  );
}

export interface CellProps {
  numeric?: boolean;
  tone?: 'default' | 'positive' | 'negative';
  /** direction glyph so colour is never the only signal */
  direction?: 'up' | 'down';
  children?: ReactNode;
}

const GLYPH = { up: '▲', down: '▼' } as const;

export function Cell({ numeric = false, tone = 'default', direction, children }: CellProps) {
  return (
    <span
      className={cx(
        numeric && 'ui-cell--numeric',
        tone === 'positive' && 'ui-cell--positive',
        tone === 'negative' && 'ui-cell--negative'
      )}
    >
      {direction ? `${GLYPH[direction]} ` : null}
      {children}
    </span>
  );
}
