export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "vexdiag.theme";

export function getStoredTheme(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // localStorage unavailable (private browsing, etc.) -- fall back silently
  }
  return "system";
}

export function applyTheme(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", pref);
  }
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // ignore -- theme just won't persist across reloads
  }
}
