export type Theme = 'dark' | 'light' | 'system';

export function applyTheme(theme: Theme) {
  const html = document.documentElement;
  html.classList.remove('light', 'dark');
  if (theme === 'dark') {
    html.classList.add('dark');
  } else if (theme === 'light') {
    html.classList.add('light');
  }
}
