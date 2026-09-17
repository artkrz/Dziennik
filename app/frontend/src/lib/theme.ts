export type Theme = "light" | "dark" | "system";

export const THEMES: readonly Theme[] = ["light", "dark", "system"] as const;
export const STORAGE_KEY = "dziennik-theme";

/** Labels are user-facing, so they stay Polish. */
export const THEME_LABELS: Record<Theme, string> = {
  light: "Jasny",
  dark: "Ciemny",
  system: "Systemowy",
};

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** Anything unrecognised or unreadable falls back to following the OS. */
export function readStoredTheme(storage?: Pick<Storage, "getItem">): Theme {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

/** The concrete theme to apply, given a preference and what the OS reports. */
export function resolveTheme(theme: Theme, prefersDark: boolean): "light" | "dark" {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}
