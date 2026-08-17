"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resolvedTheme, setTheme]);

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      title="Toggle theme (Ctrl+L)"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-200 hover:text-black dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
    >
      <Sun
        size={18}
        className="scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90"
      />
      <Moon
        size={18}
        className="absolute scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0"
      />
    </button>
  );
}
