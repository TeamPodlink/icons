import { Suspense } from "react";
import { Directory } from "@/components/directory";
import { cards } from "@/lib/platforms";

export default function Home() {
  return (
    <Suspense>
      <Directory cards={cards} heading="Home" />
    </Suspense>
  );
}
