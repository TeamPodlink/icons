import { useId } from "react";
import { CircleDashed, SquareDashed, SquircleDashed } from "lucide-react";
import { useLocation, useSearchParams } from "react-router";
import { parseGlassShape, parseVectorShape, GLASS_SHAPES, VECTOR_SHAPES } from "@/lib/vector-shape";

const SHAPE_ICONS = { square: SquareDashed, squircle: SquircleDashed, circle: CircleDashed };

export function VectorShapeControl({ facet = "flat" }: { facet?: "flat" | "glass" }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const shape = facet === "glass" ? parseGlassShape(params.get("shape")) : parseVectorShape(params.get("shape"));
  const shapes = facet === "glass" ? GLASS_SHAPES : VECTOR_SHAPES;
  const name = useId();

  return (
    <div
      role="radiogroup"
      aria-label={facet === "glass" ? "Liquid Glass shape" : "Vector shape"}
      className="inline-flex rounded-md border border-neutral-200 bg-neutral-100/60 p-0.5 text-xs dark:border-neutral-800 dark:bg-neutral-950/40"
    >
      {shapes.map((value) => {
        const Icon = SHAPE_ICONS[value];
        const label = value[0].toUpperCase() + value.slice(1);
        return (
          <label key={value} title={label} className="relative cursor-pointer">
            <input
              type="radio"
              name={name}
              value={value}
              aria-label={label}
              checked={shape === value}
              onChange={() => {
                const next = new URLSearchParams(params);
                if (value === "squircle") next.delete("shape");
                else next.set("shape", value);
                setParams(next, { replace: true, preventScrollReset: true, state: location.state });
              }}
              className="peer sr-only"
            />
            <span className="flex h-8 w-9 items-center justify-center rounded text-neutral-500 transition-colors hover:text-black peer-checked:bg-white peer-checked:text-black peer-checked:shadow-xs peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-neutral-500 dark:text-neutral-400 dark:hover:text-white dark:peer-checked:bg-neutral-700 dark:peer-checked:text-white">
              <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
            </span>
          </label>
        );
      })}
    </div>
  );
}
