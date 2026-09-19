/**
 * @trade/ui — sample screen + test harness (framework-level, no JSX transform needed).
 *
 * `sampleScreen` is the "Watchlist + Order Ticket" reference screen from the proposal.
 * `harness`      is an interactive tree used by the verification DOM tests.
 */
export function sampleScreen(ui, h) {
  const { ThemeProvider, Stack, Button, Input, Field, Checkbox, Select, DataTable, Cell, Tabs, Dialog, Banner, Toast, ToastRegion, Tooltip, Popover } =
    ui;

  const rows = [
    { symbol: 'AAPL', name: 'Apple Inc.', last: 187.42, chg: 1.24 },
    { symbol: 'MSFT', name: 'Microsoft Corp.', last: 412.08, chg: -2.61 },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', last: 118.76, chg: 3.92 },
    { symbol: 'TSLA', name: 'Tesla Inc.', last: 241.13, chg: -5.44 },
    { symbol: 'ES', name: 'E-mini S&P 500', last: 5412.25, chg: 8.5 },
    { symbol: 'EURUSD', name: 'Euro / US Dollar', last: 1.0872, chg: -0.0016 }
  ];

  const columns = [
    { key: 'symbol', header: 'Symbol', width: 96 },
    { key: 'name', header: 'Name', width: 180 },
    { key: 'last', header: 'Last', width: 112, numeric: true },
    {
      key: 'chg',
      header: 'Chg',
      width: 96,
      numeric: true,
      render: (r) =>
        h(Cell, { numeric: true, tone: r.chg >= 0 ? 'positive' : 'negative', direction: r.chg >= 0 ? 'up' : 'down' },
          Math.abs(r.chg).toFixed(2))
    }
  ];

  return h(
    ThemeProvider,
    { theme: 'light' },
    h(
      Stack,
      { gap: 4 },
      h(Banner, { tone: 'info', title: 'Info' }, 'Market data is delayed by 15 minutes.'),
      h(
        Tabs,
        {
          items: [
            { key: 'positions', label: 'Positions', content: h('p', null, 'Positions panel') },
            { key: 'orders', label: 'Orders', content: h('p', null, 'Orders panel') },
            { key: 'fills', label: 'Fills', content: h('p', null, 'Fills panel') }
          ]
        }
      ),
      h(DataTable, {
        columns,
        rows,
        getRowKey: (r) => r.symbol,
        density: 'dense',
        rowCount: 5000,
        focusableRows: true,
        caption: 'Watchlist'
      }),
      h(
        Stack,
        { direction: 'row', gap: 3, align: 'center' },
        h(Button, { variant: 'primary' }, 'Submit order'),
        h(Button, { variant: 'outline', size: 'sm' }, 'Cancel'),
        h(Button, { variant: 'danger', disabled: true }, 'Disabled')
      ),
      h(Field, { label: 'Symbol' }, h(Input, { defaultValue: 'AAPL' })),
      h(Field, { label: 'Limit price', error: 'Enter a price above 0.00' }, h(Input, { numeric: true, invalid: true, defaultValue: '-' })),
      h(Field, { label: 'Time in force' }, h(Select, { options: [{ value: 'day', label: 'Day' }, { value: 'gtc', label: 'GTC' }] })),
      h(
        Stack,
        { direction: 'row', gap: 3, align: 'center' },
        h(
          'div',
          { className: 'ui-popover-anchor' },
          h(Button, { variant: 'outline', size: 'sm', 'aria-haspopup': 'dialog' }, 'Leg details'),
          h(Popover, { open: true, onClose: () => {}, label: 'Leg details' }, h('p', null, 'Popover body'))
        ),
        h(Tooltip, { label: 'Quantity in shares' }, h(Button, { variant: 'ghost', size: 'sm' }, 'Qty'))
      ),
      h(Checkbox, { label: 'Bracket order', defaultChecked: true }),
      h(Banner, { tone: 'danger', title: 'Rejected' }, 'Insufficient buying power for this order.'),
      h(ToastRegion, null, h(Toast, { tone: 'success', title: 'Filled' }, 'Order 4821 completed.')),
      h(
        Dialog,
        {
          open: true,
          onClose: () => {},
          title: 'New order',
          footer: h(Button, { variant: 'primary' }, 'Confirm')
        },
        h(Stack, { gap: 3 }, h(Field, { label: 'Quantity' }, h(Input, { numeric: true, defaultValue: '1000' })))
      )
    )
  );
}

/** Interactive tree for DOM tests: tabs, dialog and theme switching. */
export function harness(ui, h, React) {
  const { ThemeProvider, Stack, Button, Tabs, Dialog, DataTable, useTheme } = ui;

  function ThemeControls() {
    const { theme, setTheme } = useTheme();
    return h(
      Stack,
      { direction: 'row', gap: 2, align: 'center' },
      h('span', { 'data-testid': 'theme' }, theme),
      h(Button, { variant: 'ghost', size: 'sm', onClick: () => setTheme('dark') }, 'Dark'),
      h(Button, { variant: 'ghost', size: 'sm', onClick: () => setTheme('light') }, 'Light')
    );
  }

  function Harness() {
    const [open, setOpen] = React.useState(false);
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [popoverOpen, setPopoverOpen] = React.useState(false);
    const { ThemeProvider, Button, Tabs, Dialog, Menu, MenuItem, MenuSeparator, Popover, Tooltip } = ui;
    return h(
      ThemeProvider,
      { theme: 'light' },
      h(ThemeControls, null),
      h(Tabs, {
        items: [
          { key: 'positions', label: 'Positions', content: h('p', { id: 'panel-positions' }, 'Positions panel') },
          { key: 'orders', label: 'Orders', content: h('p', { id: 'panel-orders' }, 'Orders panel') },
          { key: 'fills', label: 'Fills', content: h('p', { id: 'panel-fills' }, 'Fills panel') }
        ]
      }),
      h(Button, { variant: 'primary', id: 'open-dialog', onClick: () => setOpen(true) }, 'Trade'),
      h('div', { className: 'ui-menu-anchor' },
        h(Button, { id: 'menu-trigger', 'aria-haspopup': 'menu', 'aria-expanded': menuOpen, onClick: () => setMenuOpen((v) => !v) }, 'Actions'),
        h(
          Menu,
          { open: menuOpen, onClose: () => setMenuOpen(false), label: 'Actions' },
          h(MenuItem, { id: 'menu-reload' }, 'Reload watchlist'),
          h(MenuItem, { id: 'menu-disabled', disabled: true }, 'Manage columns'),
          h(MenuSeparator, null),
          h(MenuItem, { id: 'menu-close', onClick: () => setMenuOpen(false) }, 'Close menu')
        )
      ),
      h(
        Dialog,
        {
          open,
          onClose: () => setOpen(false),
          title: 'New order',
          footer: h(Button, { variant: 'primary', id: 'confirm-order', onClick: () => setOpen(false) }, 'Confirm')
        },
        h('p', null, 'Order ticket body')
      ),
      h(
        'div',
        { className: 'ui-popover-anchor' },
        h(Button, { id: 'popover-trigger', 'aria-haspopup': 'dialog', 'aria-expanded': popoverOpen, onClick: () => setPopoverOpen((v) => !v) }, 'Filters'),
        h(
          Popover,
          { open: popoverOpen, onClose: () => setPopoverOpen(false), label: 'Filters' },
          h('p', null, 'Popover body')
        )
      ),
      h(Tooltip, { label: 'Maximum order size' }, h(Button, { id: 'tooltip-trigger' }, 'Hover me')),
      h(Tooltip, { label: 'Composed handler test', onMouseEnter: () => {}, onFocus: () => {}, onKeyDown: () => {} }, h(Button, { id: 'composed-tooltip-trigger' }, 'Composed'))
    );
  }

  return h(Harness, null);
}

/** Rows for the stress test. */
export function stressRows(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ symbol: 'SYM' + i, name: 'Instrument ' + i, last: 100 + (i % 500) / 10, chg: i % 2 ? 0.42 : -0.31 });
  }
  return out;
}

export { stressRows as rows };
