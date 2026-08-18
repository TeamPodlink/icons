import { Suspense } from "react";
import { Directory } from "@/components/directory";
import { visibleCards } from "@/lib/platforms";

export default function Home() {
  return (
    <Suspense>
      <Directory cards={visibleCards} heading="Home" />
    </Suspense>
  );
}
