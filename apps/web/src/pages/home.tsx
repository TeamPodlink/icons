import { Navigate, useSearchParams } from "react-router";
import { Directory } from "@/components/directory";
import { parseFacet, visibleCards, type GridFacet } from "@/lib/platforms";
import { useTitle } from "@/lib/use-title";

/** Route per facet — the sidebar's top-level navigation. */
export const FACET_ROUTES: Record<GridFacet, string> = {
  glass: "/",
  flat: "/vector",
  badge: "/badges",
  compare: "/compare", // dev-only (routed behind lensesEnabled in app.tsx)
};

const FACET_TITLES: Record<GridFacet, string> = {
  glass: "refraction · podcast app icons",
  flat: "Vector · refraction",
  badge: "Badge · refraction",
  compare: "Compare · refraction",
};

const FACET_HEADINGS: Record<GridFacet, string> = {
  glass: "Home",
  flat: "Vector",
  badge: "Badge",
  compare: "Compare",
};

export function Home({ facet = "glass" }: { facet?: GridFacet }) {
  const [params] = useSearchParams();
  useTitle(FACET_TITLES[facet]);

  // Legacy ?facet= links (the old toolbar switcher) redirect to the
  // facet's route, keeping ?search/?sort intact.
  const legacy = params.get("facet");
  if (legacy !== null) {
    const target = FACET_ROUTES[parseFacet(legacy)];
    const next = new URLSearchParams(params);
    next.delete("facet");
    const search = next.toString();
    return (
      <Navigate
        to={{ pathname: target, search: search ? `?${search}` : "" }}
        replace
      />
    );
  }

  return (
    // Keyed by facet: switching facet routes remounts the directory so
    // ?search/?sort state stays truthful to the (fresh) URL.
    <Directory
      key={facet}
      cards={visibleCards}
      heading={FACET_HEADINGS[facet]}
      facet={facet}
    />
  );
}
