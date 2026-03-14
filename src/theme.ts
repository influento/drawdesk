export function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Default appState overrides for the given theme.
 *  In dark mode we disable Excalidraw's CSS canvas filter (see App.css),
 *  so we need dark background + light stroke colors directly. */
export function themeAppState(theme: "dark" | "light"): Record<string, unknown> {
  if (theme === "dark") {
    return {
      theme: "dark",
      viewBackgroundColor: "#121212",
      currentItemStrokeColor: "#ffffff",
      currentItemFontColor: "#ffffff",
    };
  }
  return { theme: "light" };
}
