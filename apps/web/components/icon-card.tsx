import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  Download,
  ImageIcon,
  Link as LinkIcon,
  Sparkles,
} from "lucide-react";
import { renderBundleDataUri } from "refraction-engine";
import {
  assetPath,
  badgePath,
  flatPath,
  type Card,
  type Facet,
} from "@/lib/platforms";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/cn";

const actionBtn =
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-200 hover:text-black dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white";

/** In-browser procedural render of a recipe-backed bundle (site demo). */
function useLiquidRender(slug: string, size: number, enabled: boolean) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    renderBundleDataUri(slug, { size })
      .then((u: string) => alive && setUri(u))
      .catch(() => alive && setUri(null));
    return () => {
      alive = false;
    };
  }, [slug, size, enabled]);
  return enabled ? uri : null;
}

const previewCls = "pointer-events-none mb-4 mt-1.5 h-24 w-24 select-none";
const previewCommon = {
  loading: "lazy" as const,
  decoding: "async" as const,
};

function GlassPreview({ card, src }: { card: Card; src?: string }) {
  const b = card.bundle!;
  const alt = `${card.title} app icon`;
  // 96px box: 128 rendition on 1x displays, 256 on 2x.
  const sized = (dark: boolean) => ({
    src: assetPath(b.slug, { size: 128, dark }),
    srcSet: `${assetPath(b.slug, { size: 128, dark })} 1x, ${assetPath(b.slug, { size: 256, dark })} 2x`,
  });
  const common = { ...previewCommon, width: 96, height: 96 };
  if (src) return <img src={src} alt={alt} {...common} className={previewCls} />;
  if (!b.hasDark)
    return (
      <img {...sized(false)} alt={alt} {...common} className={previewCls} />
    );
  return (
    <>
      <img
        {...sized(false)}
        alt={alt}
        {...common}
        className={cn(previewCls, "dark:hidden")}
      />
      <img
        {...sized(true)}
        alt={alt}
        {...common}
        className={cn(previewCls, "hidden dark:block")}
      />
    </>
  );
}

function FlatPreview({ card }: { card: Card }) {
  return (
    <img
      src={flatPath(card.platform.id)}
      alt={`${card.platform.name} icon`}
      {...previewCommon}
      width={96}
      height={96}
      className={previewCls}
    />
  );
}

/** Badge artwork is wide (~40px tall, variable width): a light/dark pair
 *  swapped by theme class, letterboxed in the same box glass icons use. */
function BadgePreview({ card }: { card: Card }) {
  const id = card.platform.id;
  const alt = `Listen on ${card.platform.name} badge`;
  const cls = "h-12 w-auto max-w-full";
  return (
    <div className="pointer-events-none mb-4 mt-1.5 flex h-24 w-full select-none items-center justify-center px-2">
      <img
        src={badgePath(id, false)}
        alt={alt}
        {...previewCommon}
        className={cn(cls, "dark:hidden")}
      />
      <img
        src={badgePath(id, true)}
        alt={alt}
        {...previewCommon}
        className={cn(cls, "hidden dark:block")}
      />
    </div>
  );
}

/** A platform missing this facet: keep the card (catalog gaps stay
 *  visible, per the QA-lens ethos) with an explicit empty treatment. */
function MissingPreview({ label }: { label: string }) {
  return (
    <div
      className={cn(
        previewCls,
        "flex items-center justify-center rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700"
      )}
    >
      <span className="px-2 text-center font-mono text-[11px] leading-tight text-neutral-400 dark:text-neutral-600">
        {label}
      </span>
    </div>
  );
}

export function IconCard({
  card,
  facet = "glass",
}: {
  card: Card;
  /** The directory-level facet view; the card adapts artwork + actions. */
  facet?: Facet;
}) {
  const [live, setLive] = useState(false);
  const { resolvedTheme } = useTheme();
  const b = card.bundle;
  const p = card.platform;

  // What this card actually shows: the glass view falls back to the flat
  // vector for platforms that have no glass bundle yet (card.facet).
  const shown: Facet =
    facet === "glass" ? (card.facet === "glass" ? "glass" : "flat") : facet;
  const missing =
    (shown === "flat" && !p.hasFlat) || (shown === "badge" && !p.hasBadge);

  const liveUri = useLiquidRender(
    b?.slug ?? "",
    192,
    shown === "glass" && live && Boolean(b?.recipe)
  );

  const title = facet === "glass" ? card.title : p.name;

  const copyText = async (text: string, description: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard", { description });
  };

  const copyImage = async () => {
    try {
      const blob = await fetch(assetPath(b!.slug)).then((r) => r.blob());
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast.success("Copied to clipboard", {
        description: `${card.title} — 1024px PNG`,
      });
    } catch {
      toast.error("Clipboard image copy not supported in this browser");
    }
  };

  const copySvg = async (url: string, description: string) => {
    const svg = await fetch(url).then((r) => r.text());
    await copyText(svg, description);
  };

  /**
   * Download via fetch + blob object URL: the `download` attribute is
   * ignored on cross-origin hrefs (production serves assets from R2),
   * where a plain anchor would navigate instead of saving. Same-origin
   * (dev /library, /flat, /badges) goes through the identical path.
   */
  const downloadAsset = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      const objectUrl = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      toast.error("Download failed");
    }
  };

  // Badge downloads/copies target the variant currently on screen.
  const badgeDark = resolvedTheme === "dark";
  const badgeUrl = badgePath(p.id, badgeDark);
  const badgeName = `${p.id}-${badgeDark ? "dark" : "light"}.svg`;

  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-neutral-200 px-3.5 py-3 hover:bg-neutral-100/80 dark:border-neutral-800 dark:hover:bg-neutral-800/20">
      <div className="flex h-6 w-full items-center justify-end space-x-2 pb-0.5">
        {shown === "flat" && facet === "glass" && (
          <span
            title="No Liquid Glass icon yet — flat vector shown. Contributions welcome!"
            className="rounded-full border border-neutral-300 px-2 py-0.5 font-mono text-[11px] text-neutral-400 dark:border-neutral-800 dark:text-neutral-500"
          >
            flat
          </span>
        )}
        {shown === "glass" && b?.recipe && (
          <button
            type="button"
            title={
              live
                ? "Live: rendered procedurally in your browser just now — click for the prerendered raster"
                : `Render this icon live in your browser — the adopted recipe, RMSE ${b.rmse} vs Apple's renderer`
            }
            onClick={() => setLive((v) => !v)}
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
        )}
      </div>

      {missing ? (
        <MissingPreview
          label={shown === "flat" ? "missing flat" : "missing badge"}
        />
      ) : shown === "glass" ? (
        <GlassPreview
          card={card}
          src={live && b?.recipe ? liveUri ?? undefined : undefined}
        />
      ) : shown === "badge" ? (
        <BadgePreview card={card} />
      ) : (
        <FlatPreview card={card} />
      )}

      <div className="mb-3 flex flex-col items-center justify-center space-y-1">
        <p className="select-all truncate text-balance text-center text-[15px] font-medium">
          {title}
        </p>
      </div>

      <div className="flex items-center space-x-0.5">
        {missing ? null : shown === "glass" ? (
          <>
            <button
              type="button"
              title="Copy 1024px PNG to clipboard"
              onClick={copyImage}
              className={actionBtn}
            >
              <ImageIcon size={16} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              title="Download 1024px PNG"
              onClick={() => downloadAsset(assetPath(b!.slug), `${b!.slug}.png`)}
              className={actionBtn}
            >
              <Download size={16} strokeWidth={1.8} />
            </button>
          </>
        ) : shown === "badge" ? (
          <>
            <button
              type="button"
              title={`Copy badge SVG (${badgeDark ? "dark" : "light"})`}
              onClick={() =>
                copySvg(
                  badgeUrl,
                  `${p.name} — ${badgeDark ? "dark" : "light"} badge SVG`
                )
              }
              className={actionBtn}
            >
              <Copy size={16} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              title={`Download badge SVG (${badgeDark ? "dark" : "light"})`}
              onClick={() => downloadAsset(badgeUrl, badgeName)}
              className={actionBtn}
            >
              <Download size={16} strokeWidth={1.8} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              title="Copy flat SVG"
              onClick={() =>
                copySvg(flatPath(p.id), `${card.title} — flat SVG`)
              }
              className={actionBtn}
            >
              <Copy size={16} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              title="Download flat SVG"
              onClick={() => downloadAsset(flatPath(p.id), `${p.id}.svg`)}
              className={actionBtn}
            >
              <Download size={16} strokeWidth={1.8} />
            </button>
          </>
        )}
        {p.url && (
          <a
            href={p.url}
            target="_blank"
            rel="noreferrer"
            title={`${p.name} website`}
            className={actionBtn}
          >
            <LinkIcon size={16} strokeWidth={1.8} />
          </a>
        )}
      </div>
    </div>
  );
}
