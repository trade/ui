import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ThemeProvider,
  useTheme,
  Stack,
  Button,
  Input,
  Field,
  Select,
  Checkbox,
  DataTable,
  Cell,
  Tabs,
  Dialog,
  Banner,
  Toast,
  ToastRegion,
  Menu,
  MenuItem,
  MenuSeparator,
  Popover,
  Tooltip
} from '@trade/ui';

const NAMES = ['Apple Inc.', 'Microsoft Corp.', 'NVIDIA Corp.', 'Tesla Inc.', 'Amazon.com Inc.', 'Alphabet Inc.', 'Meta Platforms', 'JPMorgan Chase', 'Exxon Mobil', 'E-mini S&P 500', 'Euro / US Dollar', 'Gold Futures'];

function makeRows(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const chg = Math.round(((i * 37) % 400) - 200) / 100;
    rows.push({
      symbol: `${['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'JPM', 'XOM', 'ES', 'EURUSD', 'GC'][i % 12]}${i >= 12 ? '-' + i : ''}`,
      name: NAMES[i % NAMES.length],
      last: 100 + ((i * 13) % 5000) / 10,
      chg,
      volume: 1200000 + i * 9871
    });
  }
  return rows;
}

function AppBar({ onExport }) {
  const { theme, setTheme } = useTheme();
  const [actionsOpen, setActionsOpen] = useState(false);
  return (
    <div className="app-bar">
      <span className="app-bar__brand">
        UI <small>@trade/ui</small>
      </span>
      <span className="app-bar__spacer" />
      <span className="ui-menu-anchor">
        <Button
          variant="outline"
          size="sm"
          aria-haspopup="menu"
          aria-expanded={actionsOpen}
          onClick={() => setActionsOpen((v) => !v)}
        >
          Actions
        </Button>
        <Menu open={actionsOpen} onClose={() => setActionsOpen(false)} label="Actions">
          <MenuItem
            onClick={() => {
              onExport?.();
              setActionsOpen(false);
            }}
          >
            Export watchlist
          </MenuItem>
          <MenuItem disabled>Manage columns</MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => setActionsOpen(false)}>Close menu</MenuItem>
        </Menu>
      </span>
      <Stack direction="row" gap={2} align="center">
        <span className="muted">theme: {theme}</span>
        <Button variant="ghost" size="sm" onClick={() => setTheme('light')}>Light</Button>
        <Button variant="ghost" size="sm" onClick={() => setTheme('dark')}>Dark</Button>
        <Button variant="ghost" size="sm" onClick={() => setTheme('high-contrast')}>Contrast</Button>
        <Button variant="ghost" size="sm" onClick={() => setTheme('system')}>System</Button>
      </Stack>
    </div>
  );
}

function Watchlist({ onTrade }) {
  const rows = useMemo(() => makeRows(120), []);
  const columns = useMemo(
    () => [
      { key: 'symbol', header: 'Symbol', width: 110 },
      { key: 'name', header: 'Name', width: 190 },
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
      {
        key: 'volume',
        header: 'Volume',
        width: 130,
        numeric: true,
        render: (r) => r.volume.toLocaleString()
      }
    ],
    []
  );

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(r) => r.symbol}
      density="dense"
      rowCount={rows.length}
      focusableRows
      caption="Watchlist — 120 instruments, dense density"
      onRowClick={onTrade}
    />
  );
}

function Panel({ tick }) {
  return (
    <p className="panel-note muted">
      Panel content for this tab. Theme switches restyle the whole page with no React re-render, and the
      last tick was {tick}.
    </p>
  );
}

function App() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [symbol, setSymbol] = useState('AAPL');
  const [qty, setQty] = useState('1000');
  const [price, setPrice] = useState('');
  const [tif, setTif] = useState('day');
  const [bracket, setBracket] = useState(true);
  const [toast, setToast] = useState(null);

  const openTicket = (row) => {
    if (row?.symbol) setSymbol(row.symbol);
    setDialogOpen(true);
  };

  const priceError = price !== '' && (Number.isNaN(Number(price)) || Number(price) <= 0);

  const submit = () => {
    setDialogOpen(false);
    setToast(`Order placed — ${qty} ${symbol} (${tif === 'day' ? 'Day' : 'GTC'})`);
  };

  return (
    <ThemeProvider theme="light">
      <AppBar onExport={() => setToast('Watchlist exported as CSV')} />
      <div className="page">
        <Stack gap={4}>
          <Banner tone="info" title="Delayed data">
            Market data is delayed by 15 minutes.
          </Banner>

          <Tabs
            items={[
              { key: 'positions', label: 'Positions', content: <Panel tick="18:41:07" /> },
              { key: 'orders', label: 'Orders', content: <Panel tick="18:41:07" /> },
              { key: 'fills', label: 'Fills', content: <Panel tick="18:41:07" /> },
              { key: 'history', label: 'History', content: <Panel tick="18:41:07" /> }
            ]}
          />

          <Stack direction="row" gap={3} align="center" wrap>
            <Button variant="primary" onClick={() => openTicket(null)}>New order</Button>
            <Button variant="outline" onClick={() => setToast('Watchlist refreshed')}>Refresh</Button>
            <Button variant="danger" disabled>Cancel all</Button>
            <span className="ui-popover-anchor">
              <Button
                variant="ghost"
                size="sm"
                aria-haspopup="dialog"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((v) => !v)}
              >
                Filters
              </Button>
              <Popover open={filtersOpen} onClose={() => setFiltersOpen(false)} label="Watchlist filters">
                <Stack gap={2}>
                  <Checkbox label="Hide zero-volume rows" defaultChecked />
                  <Checkbox label="Only instruments I hold" />
                </Stack>
              </Popover>
            </span>
            <Tooltip label="Resubmit the last rejected order" placement="bottom">
              <Button variant="ghost" size="sm" aria-label="Resubmit last order">↻</Button>
            </Tooltip>
            <span className="muted">Click a row to open its order ticket.</span>
          </Stack>

          <Watchlist onTrade={openTicket} />

          <Banner tone="danger" title="Rejected">
            Insufficient buying power for order 4822.
          </Banner>
        </Stack>
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={`Order ticket — ${symbol}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={priceError}>Submit order</Button>
          </>
        }
      >
        <Stack gap={3}>
          <Field label="Symbol">
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
          </Field>
          <Field label="Quantity">
            <Input numeric value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Limit price" hint="Leave blank for market order" error={priceError ? 'Enter a price above 0.00' : undefined}>
            <Input numeric value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Time in force">
            <Select
              variant="listbox"
              name="tif"
              value={tif}
              onChange={(e) => setTif(e.target.value)}
              options={[
                { value: 'day', label: 'Day' },
                { value: 'gtc', label: 'Good till cancelled' },
                { value: 'ioc', label: 'Immediate or cancel' }
              ]}
            />
          </Field>
          <Checkbox label="Bracket order" checked={bracket} onChange={(e) => setBracket(e.target.checked)} />
        </Stack>
      </Dialog>

      <ToastRegion>
        {toast ? (
          <Toast tone="success" title="Done">
            {toast}
          </Toast>
        ) : null}
      </ToastRegion>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(<App />);
