export function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Default appState overrides for the given theme.
 *  In dark mode we disable Excalidraw's --theme-filter globally (see App.css),
 *  so colors are stored and drawn as-is — we set a dark background and a
 *  light default stroke (which also drives default text color). */
export function themeAppState(theme: "dark" | "light"): Record<string, unknown> {
  if (theme === "dark") {
    return {
      theme: "dark",
      viewBackgroundColor: "#121212",
      currentItemStrokeColor: "#ffffff",
    };
  }
  return { theme: "light" };
}
