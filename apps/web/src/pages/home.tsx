import { Directory } from "@/components/directory";
import { visibleCards } from "@/lib/platforms";
import { useTitle } from "@/lib/use-title";

export function Home() {
  useTitle("refraction · podcast app icons");
  return <Directory cards={visibleCards} heading="Home" />;
}
