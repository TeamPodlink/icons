import { useEffect, useState } from "react";
import { renderBundleDataUri } from "refraction-engine";

/** In-browser procedural render of a recipe-backed bundle (site demo). */
export function useLiquidRender(slug: string, size: number, enabled: boolean) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    renderBundleDataUri(slug, { size })
      .then((u: string) => alive && setUri(u))
      .catch(() => alive && setUri(null));
    return () => {
      alive = false;
    };
  }, [slug, size, enabled]);
  return enabled ? uri : null;
}
