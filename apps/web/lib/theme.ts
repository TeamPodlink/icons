// Class-strategy theme state (replaces next-themes). The inline script in
// index.html applies the initial class before first paint; this module owns
// changes after hydration. Stored choice wins; without one, follow system.

import { useCallback, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function apply(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  emit();
}

// Track system changes while the user hasn't made an explicit choice.
if (typeof window !== "undefined") {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      try {
        if (!localStorage.getItem("theme")) apply(e.matches);
      } catch {
        apply(e.matches);
      }
    });
}

export function useTheme() {
  const resolvedTheme = useSyncExternalStore<Theme>(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () =>
      document.documentElement.classList.contains("dark") ? "dark" : "light"
  );
  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem("theme", t);
    } catch {}
    apply(t === "dark");
  }, []);
  return { resolvedTheme, setTheme } as const;
}
