import { NextRequest, NextResponse } from "next/server";
import { platforms } from "@/lib/platforms";
import { platformJson } from "@/lib/platform-json";

export function generateStaticParams() {
  return platforms.map((p) => ({ id: p.id }));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const platform = platforms.find((p) => p.id === id);
  if (!platform)
    return NextResponse.json({ error: "unknown platform" }, { status: 404 });
  return NextResponse.json(platformJson(req.nextUrl.origin, platform));
}
