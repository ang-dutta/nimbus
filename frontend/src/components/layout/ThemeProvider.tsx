'use client';

import * as React from 'react';

// Minimal theme provider using localStorage — avoids next-themes peer dep issues.
// For production, swap this out for `next-themes` ThemeProvider.

const ThemeContext = React.createContext<{
  theme: string;
  setTheme: (t: string) => void;
}>({ theme: 'system', setTheme: () => {} });

export function ThemeProvider({
  children,
  attribute = 'class',
  defaultTheme = 'system',
  enableSystem = true,
  disableTransitionOnChange = false,
}: {
  children: React.ReactNode;
  attribute?: string;
  defaultTheme?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}) {
  const [theme, setThemeState] = React.useState<string>(defaultTheme);

  React.useEffect(() => {
    const stored = localStorage.getItem('nimbus-theme') || defaultTheme;
    setThemeState(stored);
    applyTheme(stored);
  }, []);

  function applyTheme(t: string) {
    const root = document.documentElement;
    const isDark =
      t === 'dark' ||
      (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (disableTransitionOnChange) {
      root.style.transition = 'none';
      setTimeout(() => root.style.removeProperty('transition'), 0);
    }

    root.classList.toggle('dark', isDark);
  }

  function setTheme(t: string) {
    setThemeState(t);
    localStorage.setItem('nimbus-theme', t);
    applyTheme(t);
  }

  // Listen for system preference changes
  React.useEffect(() => {
    if (!enableSystem) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (theme === 'system') applyTheme('system'); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return React.useContext(ThemeContext);
}
