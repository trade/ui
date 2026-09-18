import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../internal/cx';

export type ThemeName = 'light' | 'dark' | 'high-contrast' | 'system';
export type ResolvedTheme = 'light' | 'dark' | 'high-contrast';

export interface ThemeContextValue {
  /** what the user chose */
  theme: ThemeName;
  /** what is actually applied right now — for 'system' this follows the OS preference */
  resolved: ResolvedTheme;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  theme?: ThemeName;
  children?: ReactNode;
  className?: string;
}

/**
 * Apply a theme by writing one attribute on <html>.
 * This is a pure DOM operation: it runs no React render and no style code — the browser
 * re-resolves the CSS custom properties itself. Use this for the cheapest possible switch.
 */
export function setThemeAttribute(theme: ThemeName): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  if (theme === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', theme);
}

/**
 * Theming contract for @trade/ui.
 * Switching themes writes one attribute on <html>; the browser then re-resolves CSS
 * custom properties. No React re-render is required, and no style code runs.
 */
function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Theming contract for @trade/ui.
 * Switching themes writes one attribute on <html>; the browser then re-resolves CSS
 * custom properties. No React re-render is required, and no style code runs.
 */
export function ThemeProvider({ theme: initial = 'system', children, className }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeName>(initial);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  useEffect(() => {
    setThemeAttribute(theme);
  }, [theme]);

  // 'system' must report the real preference, otherwise consumers that read `resolved`
  // (charts, canvases, third-party widgets) would paint for the wrong theme.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => setSystemTheme(mq.matches ? 'dark' : 'light');
    onChange();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    return undefined;
  }, []);

  const setTheme = useCallback((next: ThemeName) => setThemeState(next), []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolved: theme === 'system' ? systemTheme : theme, setTheme }),
    [theme, systemTheme, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      <div className={cx('ui-root', className)} data-ui-theme={theme}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
