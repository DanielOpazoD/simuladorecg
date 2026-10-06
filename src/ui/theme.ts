export type Theme = "light" | "dark";
const KEY = "ecglab-theme";

export const preferredTheme = (stored: string | null, systemDark: boolean): Theme =>
  stored === "light" || stored === "dark" ? stored : systemDark ? "dark" : "light";

export function readTheme(): Theme {
  let stored: string | null = null;
  try { stored = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  return preferredTheme(stored, !!globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches);
}

export function applyTheme(theme: Theme, persist = false) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  if (persist) try { localStorage.setItem(KEY, theme); } catch { /* storage blocked */ }
}

export const currentTheme = (): Theme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";
