import { Suspense } from "react";
import { Directory } from "@/components/directory";
import { glassCards } from "@/lib/platforms";

export const metadata = {
  title: "Liquid Glass · refraction",
};

export default function LiquidGlassPage() {
  return (
    <Suspense>
      <Directory cards={glassCards} heading="Liquid Glass" />
    </Suspense>
  );
}
