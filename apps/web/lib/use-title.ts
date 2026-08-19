import { useEffect } from "react";

/** Per-route document.title (the SPA equivalent of Next metadata).
 *  `restore` puts the previous title back on unmount — for overlays
 *  (the icon detail modal) whose background page stays mounted and so
 *  never re-runs its own title effect. */
export function useTitle(title: string, restore = false) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      if (restore) document.title = prev;
    };
  }, [title, restore]);
}
