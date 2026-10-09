import { useEffect, useState } from "react";

/**
 * The four RawJobs themes (design/README.md, "Themes and contrast"). They follow the system's
 * light/dark and increased-contrast settings unless you pick otherwise in Settings.
 * index.html runs the same resolution inline before first paint, so keep the two in step.
 */
export type ThemeChoice = "system" | "light" | "dark";
/** "more" always uses the increased contrast themes; "system" follows prefers-contrast. */
export type ContrastChoice = "system" | "more";
export type Theme = "light" | "dark" | "light-hc" | "dark-hc";

const THEME_KEY = "rawjobs.theme";
const CONTRAST_KEY = "rawjobs.contrast";
const CHANGED = "rawjobs:theme";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    if (value === "system") localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // blocked storage: the choice lasts until the page closes
  }
}

const media = (q: string) => typeof matchMedia === "function" && matchMedia(q).matches;

export function themeChoice(): ThemeChoice {
  const v = read(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function contrastChoice(): ContrastChoice {
  return read(CONTRAST_KEY) === "more" ? "more" : "system";
}

export function resolveTheme(theme = themeChoice(), contrast = contrastChoice()): Theme {
  const dark = theme === "system" ? media("(prefers-color-scheme: dark)") : theme === "dark";
  const more = contrast === "more" || media("(prefers-contrast: more)");
  return `${dark ? "dark" : "light"}${more ? "-hc" : ""}`;
}

export function applyTheme(): Theme {
  const theme = resolveTheme();
  document.documentElement.dataset.theme = theme;
  return theme;
}

export function setThemeChoice(choice: ThemeChoice): void {
  write(THEME_KEY, choice);
  applyTheme();
  window.dispatchEvent(new Event(CHANGED));
}

export function setContrastChoice(choice: ContrastChoice): void {
  write(CONTRAST_KEY, choice);
  applyTheme();
  window.dispatchEvent(new Event(CHANGED));
}

/** Feed density (design/components/Feed): comfortable rows by default, compact on request. */
export type Density = "comfortable" | "compact";
const DENSITY_KEY = "rawjobs.density";

export function densityChoice(): Density {
  return read(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
}

export function setDensityChoice(d: Density): void {
  write(DENSITY_KEY, d === "comfortable" ? "system" : d);
  window.dispatchEvent(new Event(CHANGED));
}

/** The feed density, kept in step with Settings. */
export function useDensity(): Density {
  const [d, setD] = useState(densityChoice);
  useEffect(() => {
    const refresh = () => setD(densityChoice());
    window.addEventListener(CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return d;
}

/** Your choices and the theme in use; follows the system while set to System. */
export function useTheme() {
  const [state, setState] = useState(() => ({ theme: themeChoice(), contrast: contrastChoice(), active: resolveTheme() }));
  useEffect(() => {
    const refresh = () => setState({ theme: themeChoice(), contrast: contrastChoice(), active: applyTheme() });
    const queries = ["(prefers-color-scheme: dark)", "(prefers-contrast: more)"].map((q) => matchMedia(q));
    for (const q of queries) q.addEventListener("change", refresh);
    window.addEventListener(CHANGED, refresh);
    // Another tab changed it.
    window.addEventListener("storage", refresh);
    return () => {
      for (const q of queries) q.removeEventListener("change", refresh);
      window.removeEventListener(CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return { ...state, setTheme: setThemeChoice, setContrast: setContrastChoice };
}
