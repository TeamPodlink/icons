import { useParams } from "react-router";
import { Directory } from "@/components/directory";
import { categoryNameFromSlug, getCardsByCategory } from "@/lib/platforms";
import { useTitle } from "@/lib/use-title";
import { NotFound } from "./not-found";

export function CategoryPage() {
  const { category = "" } = useParams();
  const name = categoryNameFromSlug(category);
  const cards = getCardsByCategory(category);
  useTitle(name ? `${name} · refraction` : "Not found · refraction");
  if (!name || cards.length === 0) return <NotFound />;
  return <Directory cards={cards} heading={name} />;
}
