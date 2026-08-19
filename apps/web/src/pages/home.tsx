import { Navigate, useSearchParams } from "react-router";
import { Directory } from "@/components/directory";
import { parseFacet, visibleCards, type Facet } from "@/lib/platforms";
import { useTitle } from "@/lib/use-title";

/** Route per facet — the sidebar's top-level navigation. */
export const FACET_ROUTES: Record<Facet, string> = {
  glass: "/",
  flat: "/vector",
  badge: "/badges",
};

const FACET_TITLES: Record<Facet, string> = {
  glass: "refraction · podcast app icons",
  flat: "Vector · refraction",
  badge: "Badge · refraction",
};

const FACET_HEADINGS: Record<Facet, string> = {
  glass: "Home",
  flat: "Vector",
  badge: "Badge",
};

export function Home({ facet = "glass" }: { facet?: Facet }) {
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
