import { Directory } from "@/components/directory";
import { glassCards } from "@/lib/platforms";
import { useTitle } from "@/lib/use-title";

export function LiquidGlassPage() {
  useTitle("Liquid Glass · refraction");
  // Glass-only page by definition: no facet switcher here.
  return (
    <Directory cards={glassCards} heading="Liquid Glass" facetSwitcher={false} />
  );
}
