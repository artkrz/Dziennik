import { useCallback, useEffect, useState } from "react";
import { readStoredTheme, resolveTheme, STORAGE_KEY, Theme } from "./theme";

const QUERY = "(prefers-color-scheme: dark)";

export function applyTheme(theme: Theme): void {
  const prefersDark = window.matchMedia(QUERY).matches;
  document.documentElement.classList.toggle("dark", resolveTheme(theme, prefersDark) === "dark");
}

export function useTheme(): { theme: Theme; setTheme: (next: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme(window.localStorage));

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    // Only follow the OS while the user has actually chosen to.
    const media = window.matchMedia(QUERY);
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable - the choice still applies for this session.
    }
  }, []);

  return { theme, setTheme };
}
