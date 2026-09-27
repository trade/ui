// SPDX-License-Identifier: MIT OR Apache-2.0

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ThemeProvider,
  useTheme,
  useTicks,
  Button,
  Input,
  Select,
  Field,
  Checkbox,
  DataTable,
  Cell,
  Tabs
} from '@trade/ui';

/* ── data ────────────────────────────────────────────────────────────────────
   5,000 instruments. Only the visible window is ever rendered.               */
const ROOT_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'JPM', 'XOM', 'UNH', 'V', 'PG'];
const SUFFIXES = ['', '.A', '.B', ''];

function makeInstruments(n) {
  const out = new Array(n);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < n; i++) {
    const root = ROOT_SYMBOLS[i % ROOT_SYMBOLS.length];
    const suffix = SUFFIXES[Math.floor(i / ROOT_SYMBOLS.length) % SUFFIXES.length];
    const price = 12 + rnd() * 640;
    const chg = (rnd() - 0.48) * 9;
    const hasPosition = i % 7 === 0;
    const qty = hasPosition ? (i % 3 === 0 ? -1 : 1) * (100 + Math.floor(rnd() * 40) * 100) : 0;
    // Same rnd() order as before, so the seeded book is unchanged.
    const volume = Math.floor(200_000 + rnd() * 48_000_000);
    const pnl = hasPosition ? (rnd() - 0.45) * 4200 : 0;
    out[i] = {
      id: `${root}${suffix}-${i}`,
      symbol: `${root}${suffix}`,
      name: ['Corp', 'Holdings', 'Industries', 'Group'][i % 4],
      last: price,
      chg,
      chgPct: (chg / price) * 100,
      bid: price - 0.02,
      ask: price + 0.02,
      volume,
      pos: qty,
      pnl,
      // Cost basis, so a live price carries the position's P&L with it: pnl = (last - basis) * pos.
      basis: hasPosition ? price - pnl / qty : 0
    };
  }
  return out;
}

const ROW_HEIGHT = 23;

/* ── live feed ───────────────────────────────────────────────────────────────
   A frame loop drifts a strided slice of the book and queues each frame through `useTicks`, which
   commits at most once per animation frame — a burst of messages costs one render, not one per
   message. The slice is what keeps it cheap: 512 instruments move per frame, the other 4,488 are
   shared by reference, and the stride spreads them across the whole book rather than walking it,
   so whichever window the user is looking at keeps moving. The hook owns the coalescing; this
   effect owns the data and cancels the loop on unmount. */
const TICK_WINDOW = 512;

function useLiveBook(seedBook) {
  const [book, pushBook] = useTicks(seedBook);
  useEffect(() => {
    let frame = 0;
    let cursor = 0;
    const step = () => {
      frame = requestAnimationFrame(step);
      // A queued updater form, so nothing is lost if a frame is missed and the drift always
      // applies to the freshest book rather than a stale snapshot.
      pushBook((previous) => {
        const next = previous.slice();
        for (let n = 0; n < TICK_WINDOW; n += 1) {
          const index = (cursor + n * 137) % next.length;
          const row = next[index];
          const last = Math.max(0.01, row.last + (Math.random() - 0.5) * 0.06);
          next[index] = {
            ...row,
            last,
            bid: last - 0.02,
            ask: last + 0.02,
            chgPct: (row.chg / last) * 100,
            // A live price moves the position with it, so Unreal P&L and the workspace totals
            // never disagree with the quote on screen.
            pnl: row.pos === 0 ? 0 : (last - row.basis) * row.pos
          };
        }
        return next;
      });
      cursor = (cursor + TICK_WINDOW) % seedBook.length;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [pushBook, seedBook]);
  return book;
}
/* Shared account model: the metrics strip and the ticket's "buying power after" must
   agree, and the ticket needs it up front to warn before an order is rejected. */
const ACCOUNT_BUYING_POWER = 284_120.55;
/* One source of truth for the ticket's initial state — useState and Reset both read
   this, so Reset can never drift from the defaults it is supposed to restore. */
const TICKET_DEFAULTS = { side: 'buy', qty: '100', type: 'limit', tif: 'day', bracket: true };

/** Currency formatting. maximumFractionDigits is required: with only minimumFractionDigits set,
 *  Intl defaults the maximum to 3, which is how "411,235.742" reached the screen. */
const money = (n) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── shell pieces ──────────────────────────────────────────────────────────── */

function TopBar({ ticketOpen, onToggleTicket }) {
  const { theme, setTheme } = useTheme();
  return (
    <header className="top">
      <span className="top__mark">
        UI <span>trading</span>
      </span>
      <div className="top__search">
        <Input density="dense" placeholder="Symbol or company" aria-label="Search instruments" />
      </div>
      <span className="chip chip--live">
        <i className="dot" />
        Market open
      </span>
      <span className="chip">Acct · 4RT-8821</span>
      <span className="top__spacer" />
      <Button variant="ghost" size="sm" density="dense" aria-pressed={ticketOpen} onClick={onToggleTicket}>
        Ticket
      </Button>
      <div className="top__themes">
        <Button variant="ghost" size="sm" density="dense" onClick={() => setTheme('light')}>Light</Button>
        <Button variant="ghost" size="sm" density="dense" onClick={() => setTheme('dark')}>Dark</Button>
        <Button variant="ghost" size="sm" density="dense" onClick={() => setTheme('high-contrast')}>Contrast</Button>
      </div>
    </header>
  );
}

const RAIL = ['Positions', 'Orders', 'Watch', 'Alerts', 'Setup'];

function Rail() {
  const [current, setCurrent] = useState('Watch');
  return (
    <nav className="rail" aria-label="Workspace">
      {RAIL.map((label) => (
        <button
          key={label}
          className="rail__item"
          aria-current={current === label}
          onClick={() => setCurrent(label)}
        >
          {label.slice(0, 4)}
        </button>
      ))}
    </nav>
  );
}

function Metrics({ totals }) {
  return (
    <div className="metrics">
      <div className="metric">
        <div className="metric__label">Net liquidation</div>
        <div className="metric__value num">{money(totals.netLiq)}</div>
        <div className="metric__sub muted num">{totals.positions} positions</div>
      </div>
      <div className="metric">
        <div className="metric__label">Day P&amp;L</div>
        <div className={`metric__value num ${totals.pnl >= 0 ? 'pos' : 'neg'}`}>
          {totals.pnl >= 0 ? '▲' : '▼'} {money(Math.abs(totals.pnl))}
        </div>
        <div className="metric__sub muted num">{totals.pnlPct.toFixed(2)}%</div>
      </div>
      <div className="metric">
        <div className="metric__label">Buying power</div>
        <div className="metric__value num">{money(totals.buyingPower)}</div>
        <div className="metric__sub muted">margin 4:1</div>
      </div>
      <div className="metric">
        <div className="metric__label">Exposure</div>
        <div className="metric__value num">{money(totals.exposure)}</div>
        <div className="metric__sub muted">gross, long + short</div>
      </div>
    </div>
  );
}

/* ── watchlist: the virtualized surface ──────────────────────────────────── */

function Watchlist({ instruments, onSelect, selected }) {
  const [range, setRange] = useState({ start: 0, end: 40 });

  const onScroll = useCallback(
    (e) => {
      const el = e.currentTarget;
      const start = Math.max(0, Math.floor(el.scrollTop / ROW_HEIGHT) - 6);
      const visible = Math.ceil(el.clientHeight / ROW_HEIGHT) + 12;
      setRange({ start, end: Math.min(instruments.length, start + visible) });
    },
    [instruments.length]
  );

  const columns = useMemo(
    () => [
      { key: 'symbol', header: 'Symbol', width: 108 },
      {
        key: 'last',
        header: 'Last',
        width: 96,
        numeric: true,
        render: (r) => <Cell numeric>{r.last.toFixed(2)}</Cell>
      },
      {
        key: 'chg',
        header: 'Chg',
        width: 92,
        numeric: true,
        render: (r) => (
          <Cell numeric tone={r.chg >= 0 ? 'positive' : 'negative'} direction={r.chg >= 0 ? 'up' : 'down'}>
            {Math.abs(r.chg).toFixed(2)}
          </Cell>
        )
      },
      {
        key: 'chgPct',
        header: 'Chg %',
        width: 84,
        numeric: true,
        render: (r) => (
          <Cell numeric tone={r.chgPct >= 0 ? 'positive' : 'negative'}>{r.chgPct.toFixed(2)}</Cell>
        )
      },
      { key: 'bid', header: 'Bid', width: 88, numeric: true, render: (r) => <Cell numeric>{r.bid.toFixed(2)}</Cell> },
      { key: 'ask', header: 'Ask', width: 88, numeric: true, render: (r) => <Cell numeric>{r.ask.toFixed(2)}</Cell> },
      {
        key: 'volume',
        header: 'Volume',
        width: 108,
        numeric: true,
        render: (r) => <Cell numeric>{r.volume.toLocaleString('en-US')}</Cell>
      },
      {
        key: 'pos',
        header: 'Position',
        width: 96,
        numeric: true,
        render: (r) => (r.pos === 0 ? <span className="muted num">—</span> : <Cell numeric>{r.pos.toLocaleString('en-US')}</Cell>)
      },
      {
        key: 'pnl',
        header: 'Unreal P&L',
        width: 108,
        numeric: true,
        render: (r) =>
          r.pos === 0 ? (
            <span className="muted num">—</span>
          ) : (
            <Cell numeric tone={r.pnl >= 0 ? 'positive' : 'negative'}>
              {r.pnl.toFixed(2)}
            </Cell>
          )
      }
    ],
    []
  );

  // visibleRows, NOT `window` — shadowing the global is how a future keyboard-handler
  // edit silently reads `window.scrollTop` and throws only in production.
  const visibleRows = instruments.slice(range.start, range.end);

  return (
    <section className="watchlist" aria-label="Watchlist">
      <div className="panelbar">
        <span className="panelbar__title">Watchlist</span>
        <span className="muted tiny num">{instruments.length.toLocaleString('en-US')} instruments</span>
        <span className="panelbar__spacer" />
        <span className="muted tiny">
          {selected ? `Selected ${selected.symbol}` : 'Click a row to load the ticket'}
        </span>
      </div>
      <DataTable
        columns={columns}
        rows={visibleRows}
        getRowKey={(r) => r.id}
        density="dense"
        rowHeight={ROW_HEIGHT}
        rowCount={instruments.length}
        rowOffset={range.start}
        onScroll={onScroll}
        focusableRows
        onRowClick={onSelect}
      />
    </section>
  );
}

/* ── blotter ──────────────────────────────────────────────────────────────── */

const FILLS = [
  ['09:31:04', 'AAPL', 'Buy', 400, 187.12, 'Filled'],
  ['09:33:51', 'NVDA', 'Sell', 250, 118.44, 'Filled'],
  ['09:41:17', 'MSFT', 'Buy', 150, 411.90, 'Filled'],
  ['10:02:38', 'TSLA', 'Sell', 300, 242.05, 'Partial'],
  ['10:18:02', 'ES', 'Buy', 2, 5410.25, 'Working']
];

function Blotter() {
  const [tab, setTab] = useState('fills');
  const columns = [
    { key: 'time', header: 'Time', width: 78 },
    { key: 'symbol', header: 'Symbol', width: 84 },
    { key: 'side', header: 'Side', width: 64 },
    { key: 'qty', header: 'Qty', width: 84, numeric: true },
    { key: 'px', header: 'Price', width: 96, numeric: true, render: (r) => <Cell numeric>{r.px.toFixed(2)}</Cell> },
    { key: 'status', header: 'Status', width: 90 }
  ];
  const rows = FILLS.map(([time, symbol, side, qty, px, status]) => ({ time, symbol, side, qty, px, status }));

  return (
    <section className="blotter" aria-label="Blotter">
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { key: 'fills', label: 'Fills', content: null },
          { key: 'orders', label: 'Working orders', content: null },
          { key: 'positions', label: 'Positions', content: null }
        ]}
      />
      <div className="blotter__body">
        {tab === 'fills' ? (
          <DataTable columns={columns} rows={rows} getRowKey={(r, i) => `${r.time}-${i}`} density="dense" />
        ) : (
          <div className="blotter__empty">Nothing working right now.</div>
        )}
      </div>
    </section>
  );
}

/* ── order ticket ─────────────────────────────────────────────────────────── */

function Ticket({ instrument, open }) {
  const [side, setSide] = useState(TICKET_DEFAULTS.side);
  // the default quantity is affordable for the default instrument: the primary
  // button renders as an ACTIVE primary on load, not greeting the user disabled
  const [qty, setQty] = useState(TICKET_DEFAULTS.qty);
  const [type, setType] = useState(TICKET_DEFAULTS.type);
  const [price, setPrice] = useState('');
  const [tif, setTif] = useState(TICKET_DEFAULTS.tif);
  const [bracket, setBracket] = useState(TICKET_DEFAULTS.bracket);
  const [submitted, setSubmitted] = useState(null);

  useEffect(() => {
    if (instrument) setPrice(instrument.last.toFixed(2));
  }, [instrument]);

  const limit = Number(price);
  const priceError = type === 'limit' && (price === '' || Number.isNaN(limit) || limit <= 0);
  const notional = (Number(qty) || 0) * (type === 'limit' ? limit || 0 : instrument?.last || 0);
  const commission = Math.max(1, notional * 0.0001);
  const insufficient = notional > ACCOUNT_BUYING_POWER;

  // Reset restores the WHOLE ticket to TICKET_DEFAULTS — side included — and clears
  // the last submission status. A partial reset that left Sell selected was a lie
  // of a button.
  const resetTicket = () => {
    setSide(TICKET_DEFAULTS.side);
    setQty(TICKET_DEFAULTS.qty);
    setType(TICKET_DEFAULTS.type);
    setPrice(instrument ? instrument.last.toFixed(2) : '');
    setTif(TICKET_DEFAULTS.tif);
    setBracket(TICKET_DEFAULTS.bracket);
    setSubmitted(null);
  };

  return (
    <aside className="ticket" data-open={open} aria-label="Order ticket">
      <div className="ticket__head">
        <span className="ticket__symbol">{instrument ? instrument.symbol : '—'}</span>
        <span className="muted tiny num">
          {instrument ? `${instrument.bid.toFixed(2)} / ${instrument.ask.toFixed(2)}` : 'no instrument'}
        </span>
      </div>

      <div className="side" role="group" aria-label="Side">
        <button type="button" data-side="buy" aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>
          Buy
        </button>
        <button type="button" data-side="sell" aria-pressed={side === 'sell'} onClick={() => setSide('sell')}>
          Sell
        </button>
      </div>

      <div className="ticket__row">
        <label htmlFor="tk-qty">Quantity</label>
        <Input id="tk-qty" density="dense" numeric value={qty} onChange={(e) => setQty(e.target.value)} />
      </div>

      <div className="ticket__row">
        <label htmlFor="tk-type">Order type</label>
        <Select
          id="tk-type"
          density="dense"
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={[
            { value: 'market', label: 'Market' },
            { value: 'limit', label: 'Limit' },
            { value: 'stop', label: 'Stop' }
          ]}
        />
      </div>

      <Field label="Limit price" error={priceError ? 'Enter a price above 0.00' : undefined}>
        <Input density="dense" numeric value={price} onChange={(e) => setPrice(e.target.value)} disabled={type !== 'limit'} />
      </Field>

      <div className="ticket__row">
        <label htmlFor="tk-tif">Time in force</label>
        <Select
          id="tk-tif"
          density="dense"
          value={tif}
          onChange={(e) => setTif(e.target.value)}
          options={[
            { value: 'day', label: 'Day' },
            { value: 'gtc', label: 'Good till cancelled' },
            { value: 'ioc', label: 'Immediate or cancel' }
          ]}
        />
      </div>

      <Checkbox density="dense" label="Bracket with stop" checked={bracket} onChange={(e) => setBracket(e.target.checked)} />

      <div className="ticket__summary">
        <div className="ticket__line">
          <span className="muted">Notional</span>
          <span className="num">{money(notional)}</span>
        </div>
        <div className="ticket__line">
          <span className="muted">Est. commission</span>
          <span className="num">{commission.toFixed(2)}</span>
        </div>
        <div className="ticket__line">
          <span className="muted">Buying power after</span>
          <span className="num">{money(ACCOUNT_BUYING_POWER - notional)}</span>
        </div>
      </div>

      {insufficient ? (
        <div className="ticket__warn" role="note">
          Order exceeds buying power — reduce the quantity.
        </div>
      ) : null}

      <div className="ticket__actions">
        <Button variant="outline" density="compact" onClick={resetTicket}>
          Reset
        </Button>
        <Button
          variant={side === 'buy' ? 'primary' : 'danger'}
          density="compact"
          disabled={priceError || !instrument || insufficient}
          onClick={() => setSubmitted({ side, qty, symbol: instrument?.symbol ?? '' })}
        >
          {side === 'buy' ? 'Buy' : 'Sell'} {qty || 0}
        </Button>
      </div>

      {submitted ? (
        <div className="ticket__status" role="status">
          Working: {submitted.side} {submitted.qty} {submitted.symbol}
        </div>
      ) : null}
    </aside>
  );
}

function StatusBar({ count }) {
  return (
    <footer className="status">
      <span>
        <i className="dot" /> Connected
      </span>
      <span>Feed latency 14 ms</span>
      <span>Data delayed 15 min</span>
      <span className="status__spacer" />
      <span className="num">{count.toLocaleString('en-US')} rows</span>
      <span className="num">rendered {Math.min(count, 46)} of {count.toLocaleString('en-US')}</span>
    </footer>
  );
}

/* ── app ──────────────────────────────────────────────────────────────────── */

function Workspace() {
  const seedBook = useMemo(() => makeInstruments(5000), []);
  const instruments = useLiveBook(seedBook);
  // Selecting a row loads the ticket with that row as it stood when clicked: the form's inputs
  // must not move under the user while the book ticks.
  const [selected, setSelected] = useState(seedBook[0]);
  const [ticketOpen, setTicketOpen] = useState(true);

  // Positions are a fixed slice of the book and a tick never adds or removes one, so the per-frame
  // totals walk the positioned rows only (about a seventh) rather than all 5,000.
  const positionIndexes = useMemo(
    () => seedBook.flatMap((row, index) => (row.pos === 0 ? [] : [index])),
    [seedBook]
  );

  const totals = useMemo(() => {
    let pnl = 0;
    let exposure = 0;
    for (const index of positionIndexes) {
      const row = instruments[index];
      pnl += row.pnl;
      exposure += Math.abs(row.pos * row.last);
    }
    const positions = positionIndexes.length;
    const netLiq = ACCOUNT_BUYING_POWER + pnl;
    return { pnl, positions, exposure, netLiq, pnlPct: (pnl / netLiq) * 100, buyingPower: ACCOUNT_BUYING_POWER };
  }, [instruments, positionIndexes]);

  return (
    <div className="shell">
      <TopBar ticketOpen={ticketOpen} onToggleTicket={() => setTicketOpen((v) => !v)} />
      <Rail />
      <main className="main">
        <h1 className="ui-visually-hidden">Trading workspace</h1>
        <Metrics totals={totals} />
        <Watchlist instruments={instruments} onSelect={setSelected} selected={selected} />
        <Blotter />
      </main>
      <Ticket instrument={selected} open={ticketOpen} />
      <StatusBar count={instruments.length} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <ThemeProvider theme="light">
    <Workspace />
  </ThemeProvider>
);
