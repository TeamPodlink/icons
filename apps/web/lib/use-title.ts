import { useEffect } from "react";

/** Per-route document.title (the SPA equivalent of Next metadata). */
export function useTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
