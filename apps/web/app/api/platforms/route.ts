import { NextRequest, NextResponse } from "next/server";
import { categorySlug, platforms } from "@/lib/platforms";
import { platformJson } from "@/lib/platform-json";

export function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  let list = platforms.map((p) => platformJson(origin, p));

  const search = searchParams.get("search")?.toLowerCase();
  if (search)
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.id.includes(search) ||
        p.liquidGlass.some((b) => b.title.toLowerCase().includes(search))
    );

  const category = searchParams.get("category");
  if (category)
    list = list.filter((p) =>
      p.categories.some((c) => categorySlug(c) === categorySlug(category))
    );

  if (searchParams.get("facet") === "liquid-glass")
    list = list.filter((p) => p.liquidGlass.length > 0);

  const limit = Number(searchParams.get("limit"));
  if (Number.isFinite(limit) && limit > 0) list = list.slice(0, limit);

  if (list.length === 0)
    return NextResponse.json({ error: "no platforms found" }, { status: 404 });
  return NextResponse.json(list);
}
