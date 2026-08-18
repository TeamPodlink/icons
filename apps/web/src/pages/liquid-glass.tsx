import { Directory } from "@/components/directory";
import { glassCards } from "@/lib/platforms";
import { useTitle } from "@/lib/use-title";

export function LiquidGlassPage() {
  useTitle("Liquid Glass · refraction");
  return <Directory cards={glassCards} heading="Liquid Glass" />;
}
