import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, Stack, Button, DataTable, Cell, Banner, Tabs, setThemeAttribute } from '@trade/ui';

const SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'JPM', 'XOM', 'ES', 'EURUSD', 'GC'];

function makeRows(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      symbol: `${SYMBOLS[i % SYMBOLS.length]}${i >= 12 ? '-' + i : ''}`,
      last: 100 + (i % 400) / 10,
      chg: Math.round((((i * 37) % 400) - 200)) / 100,
      volume: 1200000 + i * 9871
    });
  }
  return out;
}

const COLUMNS = [
  { key: 'symbol', header: 'Symbol', width: 110 },
  // formatted like a real quote would be — a raw float ("101.41000000000001") is never
  // acceptable output, and fixed two-decimal strings keep the visual baseline deterministic
  { key: 'last', header: 'Last', width: 110, numeric: true, render: (r) => r.last.toFixed(2) },
  {
    key: 'chg',
    header: 'Chg',
    width: 110,
    numeric: true,
    render: (r) => (
      <Cell numeric tone={r.chg >= 0 ? 'positive' : 'negative'} direction={r.chg >= 0 ? 'up' : 'down'}>
        {Math.abs(r.chg).toFixed(2)}
      </Cell>
    )
  },
  { key: 'volume', header: 'Volume', width: 140, numeric: true, render: (r) => r.volume.toLocaleString() }
];

/** Live viewport: renders only the rows a real grid would show, and ticks them. */
function LiveTable({ rowCount }) {
  const base = useRef(makeRows(60));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let raf = 0;
    let running = false;
    const loop = () => {
      setTick((t) => t + 1);
      if (running) raf = requestAnimationFrame(loop);
    };
    window.__startTick = () => {
      running = true;
      raf = requestAnimationFrame(loop);
    };
    window.__stopTick = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    // Capture freeze for the visual baseline: stop the feed and return the table to its
    // canonical initial state (tick 0), so every run and every host renders the exact
    // same strings. Without this, the screenshot's LAST column depends on how many ticks
    // elapsed before capture, and the gate false-fails on unchanged UI.
    window.__freezeTable = () => {
      running = false;
      cancelAnimationFrame(raf);
      setTick(0);
    };
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      delete window.__freezeTable;
    };
  }, []);

  const rows = base.current.map((r, i) => ({ ...r, last: r.last + ((tick + i) % 9) * 0.01 }));

  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      getRowKey={(r) => r.symbol}
      density="dense"
      rowCount={rowCount}
      focusableRows
      caption={`Live viewport — ${rows.length} rendered rows, ${rowCount.toLocaleString()} instruments in the dataset`}
    />
  );
}

/** Structural table: the full dataset, used to check ARIA counts and DOM size. */
function FullTable({ rows }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      getRowKey={(r) => r.symbol}
      density="dense"
      rowCount={rows.length}
      caption={`Full dataset — ${rows.length.toLocaleString()} rows in the DOM`}
    />
  );
}

function Panel() {
  return <p style={{ margin: 0 }}>Panel content.</p>;
}

function App() {
  const full = useRef(makeRows(5000));
  const [mode, setMode] = useState('live');

  return (
    <ThemeProvider theme="light">
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '16px' }}>
        <Stack gap={4}>
          <Banner tone="info" title="Harness">
            This page measures itself: frame timing under ticking data, layout overflow, theme switching and
            accessibility. Results are printed below.
          </Banner>

          <Stack direction="row" gap={2} align="center" wrap>
            <Button variant="primary" onClick={() => setMode('live')} aria-pressed={mode === 'live'}>
              Live viewport (60 rows, ticking)
            </Button>
            <Button variant="outline" onClick={() => setMode('full')} aria-pressed={mode === 'full'}>
              Full dataset (5,000 rows)
            </Button>
            <Button variant="ghost" size="sm" id="to-dark" onClick={() => setThemeAttribute('dark')}>Dark</Button>
            <Button variant="ghost" size="sm" id="to-light" onClick={() => setThemeAttribute('light')}>Light</Button>
          </Stack>

          <Tabs
            items={[
              { key: 'a', label: 'Positions', content: <Panel /> },
              { key: 'b', label: 'Orders', content: <Panel /> }
            ]}
          />

          {mode === 'live' ? <LiveTable rowCount={200000} /> : <FullTable rows={full.current} />}

          <pre
            id="audit"
            style={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--ui-font-numeric)',
              fontSize: 12,
              background: 'var(--ui-surface-1)',
              border: '1px solid var(--ui-outline)',
              borderRadius: 4,
              padding: 12,
              margin: 0
            }}
          >
            running…
          </pre>
        </Stack>
      </div>
    </ThemeProvider>
  );
}

/** Static (non-ticking) frame timing — isolates paint cost from per-frame re-render cost. */
window.__runStaticBenchmark = (durationMs = 1500) =>
  new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    const start = last;
    const frame = (now) => {
      deltas.push(now - last);
      last = now;
      if (now - start < durationMs) requestAnimationFrame(frame);
      else {
        const elapsed = deltas.reduce((a, b) => a + b, 0);
        const sorted = [...deltas].sort((a, b) => a - b);
        const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
        resolve({
          frames: deltas.length,
          fps: elapsed > 0 ? Number(((deltas.length / elapsed) * 1000).toFixed(1)) : 0,
          p95: Number(pct(0.95).toFixed(2))
        });
      }
    };
    requestAnimationFrame(frame);
  });

/** Frame-timing benchmark. Ticks the viewport every frame and records frame deltas.
 *  Reports the raw window and a steady-state window (start-up frames discarded), because the
 *  first paints after navigation are not representative of sustained load. */
window.__runFrameBenchmark = (durationMs = 3000, warmupFrames = 10) =>
  new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    const start = last;

    const summarize = (arr) => {
      const elapsed = arr.reduce((a, b) => a + b, 0);
      const sorted = [...arr].sort((a, b) => a - b);
      const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
      return {
        frames: arr.length,
        elapsedMs: Math.round(elapsed),
        fps: elapsed > 0 ? Number(((arr.length / elapsed) * 1000).toFixed(1)) : 0,
        p50: Number(pct(0.5).toFixed(2)),
        p95: Number(pct(0.95).toFixed(2)),
        max: Number(sorted[sorted.length - 1]?.toFixed(2) ?? 0),
        over16_7: arr.filter((d) => d > 16.7).length,
        over33: arr.filter((d) => d > 33).length
      };
    };

    const stop = () => {
      window.__stopTick?.();
      const steady = deltas.length > warmupFrames + 20 ? deltas.slice(warmupFrames) : deltas;
      resolve({ raw: summarize(deltas), steady: summarize(steady), warmupFrames });
    };

    window.__startTick?.();
    const frame = (now) => {
      deltas.push(now - last);
      last = now;
      if (now - start < durationMs) requestAnimationFrame(frame);
      else stop();
    };
    requestAnimationFrame(frame);
  });

createRoot(document.getElementById('root')).render(<App />);

window.__setTheme = setThemeAttribute;
