import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Directory } from "@/components/directory";
import {
  categoryNameFromSlug,
  categorySlug,
  getCardsByCategory,
  getCategories,
} from "@/lib/platforms";

export function generateStaticParams() {
  return getCategories().map((c) => ({ category: categorySlug(c.name) }));
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const name = categoryNameFromSlug(category);
  const cards = getCardsByCategory(category);
  if (!name || cards.length === 0) notFound();
  return (
    <Suspense>
      <Directory cards={cards} heading={name} />
    </Suspense>
  );
}
