import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

/** The "live" toggle chip: swaps a recipe-backed bundle's prerendered
 *  raster for an in-browser procedural render (icon cards + detail). */
export function LiveChip({
  live,
  rmse,
  onToggle,
}: {
  live: boolean;
  rmse: number | null;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      title={
        live
          ? "Live: rendered procedurally in your browser just now — click for the prerendered raster"
          : `Render this icon live in your browser — the adopted recipe, RMSE ${rmse} vs Apple's renderer`
      }
      onClick={onToggle}
      className={cn(
        "flex cursor-pointer items-center space-x-1 rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium",
        live
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-neutral-400 text-neutral-600 hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-600 dark:border-neutral-600 dark:text-neutral-300 dark:hover:border-emerald-500/50 dark:hover:text-emerald-400"
      )}
    >
      <Sparkles size={11} strokeWidth={1.8} />
      <span>live</span>
    </button>
  );
}
