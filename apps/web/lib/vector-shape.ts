export const VECTOR_SHAPES = ["square", "squircle", "circle"] as const;
export type VectorShape = (typeof VECTOR_SHAPES)[number];

export function parseVectorShape(value: string | null): VectorShape {
  return value === "square" || value === "circle" ? value : "squircle";
}

export const GLASS_SHAPES = ["squircle", "circle"] as const;
export type GlassShape = (typeof GLASS_SHAPES)[number];

export function parseGlassShape(value: string | null): GlassShape {
  return value === "circle" ? "circle" : "squircle";
}
