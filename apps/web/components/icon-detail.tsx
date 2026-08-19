import { useState } from "react";
import {
  CodeXml,
  Copy,
  Download,
  ExternalLink,
  ImageIcon,
} from "lucide-react";
import {
  assetPath,
  badgePath,
  flatPath,
  sourceLabel,
  type GlassBundle,
  type Platform,
} from "@/lib/platforms";
import {
  copyImage,
  copySvg,
  copyText,
  downloadAsset,
} from "@/lib/asset-actions";
import { embedHtml } from "@/lib/embed-html";
import { useLiquidRender } from "@/lib/use-liquid-render";
import { useParallax } from "@/lib/use-parallax";
import { cn } from "@/lib/cn";
import { LiveChip } from "@/components/live-chip";
import { iconTransitionName } from "@/lib/view-transition";

/**
 * Morph-lock milestone: the detail is stripped to the card's own
 * composition — artwork + title — while the cell → dialog-panel
 * container morph gets locked in against real-browser motion. The full
 * header/actions/sections below are parked, not deleted: flip this flag
 * to reintroduce them (they render exactly as before).
 */
const DETAIL_SECTIONS = false;

/** Labeled action button (the detail view has room for words; cards
 *  keep their icon-only 9×9 buttons). */
const labeledBtn =
  "flex cursor-pointer items-center space-x-1.5 rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-black dark:border-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white";

/** Compact icon-only button (badge tiles). */
const iconBtn =
  "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-200 hover:text-black dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function formatAdded(added: string): string {
  const d = new Date(`${added}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? added
    : d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

/** The large glass artwork box: light/dark renditions (or the live
 *  procedural render), the shared-element name + grid-card handoff, and
 *  the pointer parallax. Used by the minimal modal card, the full-page
 *  detail's Liquid Glass hero, and the parked full GlassSection. */
export function GlassArtwork({ bundle }: { bundle: GlassBundle }) {
  const [live, setLive] = useState(false);
  const liveUri = useLiquidRender(bundle.slug, 512, live && bundle.recipe);
  const parallax = useParallax<HTMLDivElement>();
  const alt = `${bundle.title} app icon`;
  // 256px box: 256 rendition on 1x displays, 512 on 2x.
  const sized = (dark: boolean) => ({
    src: assetPath(bundle.slug, { size: 256, dark }),
    srcSet: `${assetPath(bundle.slug, { size: 256, dark })} 1x, ${assetPath(bundle.slug, { size: 512, dark })} 2x`,
  });
  const imgCls = "h-64 w-64 select-none";
  const common = { decoding: "async" as const, width: 256, height: 256 };

  return (
    <div className="relative flex justify-center py-2">
      {DETAIL_SECTIONS && bundle.recipe && (
        <div className="absolute right-0 top-0">
          <LiveChip
            live={live}
            rmse={bundle.rmse}
            onToggle={() => setLive((v) => !v)}
          />
        </div>
      )}
      {/* Named for the card → detail shared-element morph; tilts and
          shines under the pointer (both prerendered and live modes). */}
      <div
        ref={parallax.ref}
        style={{ viewTransitionName: iconTransitionName(bundle.slug) }}
        className="relative h-64 w-64"
      >
        {live && bundle.recipe && liveUri ? (
          <img src={liveUri} alt={alt} {...common} className={imgCls} />
        ) : !bundle.hasDark ? (
          <img {...sized(false)} alt={alt} {...common} className={imgCls} />
        ) : (
          <>
            <img
              {...sized(false)}
              alt={alt}
              {...common}
              className={cn(imgCls, "dark:hidden")}
            />
            <img
              {...sized(true)}
              alt={alt}
              {...common}
              className={cn(imgCls, "hidden dark:block")}
            />
          </>
        )}
        {/* Specular highlight tracking the pointer; radius matches the
            icon squircle so the shine stays on the artwork. */}
        <div
          ref={parallax.shineRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[22.5%] opacity-0 transition-opacity duration-300"
        />
      </div>
    </div>
  );
}

/** The flat vector, scaled up. `named` (glass-less platforms, where the
 *  flat artwork IS the card's morph hero — the platform id is its key)
 *  carries the transition name + grid handoff; the full-page Vector
 *  segment of a glass platform renders it unnamed, so the morph names
 *  stay on the glass hero only. */
export function FlatArtwork({
  platform,
  named = true,
}: {
  platform: Platform;
  named?: boolean;
}) {
  return (
    <div className="flex justify-center py-2">
      <img
        src={flatPath(platform.id)}
        alt={`${platform.name} icon`}
        decoding="async"
        width={160}
        height={160}
        style={
          named
            ? { viewTransitionName: iconTransitionName(platform.id) }
            : undefined
        }
        className="h-40 w-40 select-none"
      />
    </div>
  );
}

/** One Liquid Glass bundle: large preview (light/dark renditions, live
 *  render for recipe bundles), PNG actions, and the <picture> embed copy.
 *  Parked behind DETAIL_SECTIONS during the morph-lock milestone. */
function GlassSection({ bundle }: { bundle: GlassBundle }) {
  return (
    <Section title={bundle.variant ? `Liquid Glass — ${bundle.title}` : "Liquid Glass"}>
      <GlassArtwork bundle={bundle} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          title="Copy 1024px PNG to clipboard"
          onClick={() =>
            copyImage(assetPath(bundle.slug), `${bundle.title} — 1024px PNG`)
          }
          className={labeledBtn}
        >
          <ImageIcon size={15} strokeWidth={1.8} />
          <span>Copy PNG</span>
        </button>
        <button
          type="button"
          title="Download 1024px PNG"
          onClick={() =>
            downloadAsset(assetPath(bundle.slug), `${bundle.slug}.png`)
          }
          className={labeledBtn}
        >
          <Download size={15} strokeWidth={1.8} />
          <span>PNG 1024</span>
        </button>
        {bundle.hasDark && (
          <button
            type="button"
            title="Download 1024px PNG (dark rendition)"
            onClick={() =>
              downloadAsset(
                assetPath(bundle.slug, { dark: true }),
                `${bundle.slug}-dark.png`
              )
            }
            className={labeledBtn}
          >
            <Download size={15} strokeWidth={1.8} />
            <span>PNG 1024 dark</span>
          </button>
        )}
        <button
          type="button"
          title="Copy a ready-to-paste <picture> element — AVIF/WebP sources, dark rendition, lazy-loading fallback"
          onClick={() =>
            copyText(embedHtml(bundle), `${bundle.title} — <picture> embed`)
          }
          className={labeledBtn}
        >
          <CodeXml size={15} strokeWidth={1.8} />
          <span>Copy embed HTML</span>
        </button>
      </div>
    </Section>
  );
}

/** `named`: glass-less platforms morph their card artwork into this
 *  preview instead (the platform id doubles as the card key there); with
 *  bundles present the GlassSection already owns the name. */
function VectorSection({
  platform,
  named,
}: {
  platform: Platform;
  named: boolean;
}) {
  return (
    <Section title="Vector">
      <div className="flex items-center space-x-4">
        <img
          src={flatPath(platform.id)}
          alt={`${platform.name} icon`}
          decoding="async"
          width={80}
          height={80}
          style={
            named
              ? { viewTransitionName: iconTransitionName(platform.id) }
              : undefined
          }
          className="h-20 w-20 select-none"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            title="Copy flat SVG"
            onClick={() =>
              copySvg(flatPath(platform.id), `${platform.name} — flat SVG`)
            }
            className={labeledBtn}
          >
            <Copy size={15} strokeWidth={1.8} />
            <span>Copy SVG</span>
          </button>
          <button
            type="button"
            title="Download flat SVG"
            onClick={() =>
              downloadAsset(flatPath(platform.id), `${platform.id}.svg`)
            }
            className={labeledBtn}
          >
            <Download size={15} strokeWidth={1.8} />
            <span>SVG</span>
          </button>
        </div>
      </div>
    </Section>
  );
}

/** One badge variant on its own truthful surface (light on white, dark
 *  on near-black) so both are visible whatever the site theme is. */
export function BadgeTile({
  platform,
  dark,
}: {
  platform: Platform;
  dark: boolean;
}) {
  const url = badgePath(platform.id, dark);
  const label = dark ? "dark" : "light";
  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
      <div
        className={cn(
          "flex h-24 items-center justify-center px-4",
          dark ? "bg-neutral-950" : "bg-white"
        )}
      >
        <img
          src={url}
          alt={`Listen on ${platform.name} badge (${label})`}
          decoding="async"
          className="h-10 w-auto max-w-full select-none"
        />
      </div>
      <div className="flex items-center justify-between border-t border-neutral-200 py-1 pl-3 pr-1 dark:border-neutral-800">
        <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
          {label}
        </span>
        <div className="flex items-center space-x-0.5">
          <button
            type="button"
            title={`Copy badge SVG (${label})`}
            onClick={() =>
              copySvg(url, `${platform.name} — ${label} badge SVG`)
            }
            className={iconBtn}
          >
            <Copy size={15} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            title={`Download badge SVG (${label})`}
            onClick={() =>
              downloadAsset(url, `${platform.id}-${label}.svg`)
            }
            className={iconBtn}
          >
            <Download size={15} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The facet-agnostic platform detail: header (name, website, provenance,
 * added date) plus one section per facet the platform actually ships —
 * missing facets are simply omitted here (the QA lenses own the gaps).
 * Rendered both as the /icon/:id full page and inside the grid modal.
 */
export function IconDetail({ platform }: { platform: Platform }) {
  const p = platform;
  const provenance = p.bundles[0] ? sourceLabel(p.bundles[0]) : null;
  const host = p.url
    ? new URL(p.url).hostname.replace(/^www\./, "")
    : null;

  // Morph-lock milestone: a scaled-up card — artwork + title, centered —
  // so the cell → panel container morph can be judged on matching
  // composition. The full detail below returns with DETAIL_SECTIONS.
  if (!DETAIL_SECTIONS) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 p-8 sm:p-10">
        {p.bundles[0] ? (
          <GlassArtwork bundle={p.bundles[0]} />
        ) : p.hasFlat ? (
          <FlatArtwork platform={p} />
        ) : null}
        <h1 className="text-center text-2xl font-semibold">{p.name}</h1>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 sm:p-8">
      <header className="space-y-1.5 pr-10">
        <h1 className="text-2xl font-semibold">{p.name}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-500 dark:text-neutral-400">
          {p.url && host && (
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              title={`${p.name} website`}
              className="flex items-center space-x-1 hover:text-black dark:hover:text-white"
            >
              <span>{host}</span>
              <ExternalLink size={13} strokeWidth={1.8} />
            </a>
          )}
          {provenance && (
            <span
              title="Artwork provenance"
              className="font-mono text-xs"
            >
              {provenance}
            </span>
          )}
          {p.added && (
            <span title="First added to the collection" className="font-mono text-xs">
              added {formatAdded(p.added)}
            </span>
          )}
        </div>
      </header>

      {p.bundles.map((b) => (
        <GlassSection key={b.slug} bundle={b} />
      ))}
      {p.hasFlat && (
        <VectorSection platform={p} named={p.bundles.length === 0} />
      )}
      {p.hasBadge && (
        <Section title="Badge">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <BadgeTile platform={p} dark={false} />
            <BadgeTile platform={p} dark={true} />
          </div>
        </Section>
      )}
    </div>
  );
}
