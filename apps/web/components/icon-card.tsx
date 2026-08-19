import { useState } from "react";
import { useLocation } from "react-router";
import {
  CodeXml,
  Copy,
  Download,
  ImageIcon,
  Maximize2,
  Moon,
} from "lucide-react";
import {
  ContextMenu,
  type ContextMenuItem,
} from "@/components/context-menu";
import { TransitionLink } from "@/components/transition-link";
import { copyImage, copySvg, copyText, downloadAsset } from "@/lib/asset-actions";
import { embedHtml } from "@/lib/embed-html";
import {
  assetPath,
  badgePath,
  flatPath,
  type Card,
  type Facet,
} from "@/lib/platforms";
import { useLiquidRender } from "@/lib/use-liquid-render";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/cn";
import { LiveChip } from "@/components/live-chip";
import {
  iconTransitionName,
  useOpenDetailPlatformId,
  useTransitionNavigate,
} from "@/lib/view-transition";

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
  const location = useLocation();
  const navigate = useTransitionNavigate();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const b = card.bundle;
  const p = card.platform;

  // Shared-element morph: the artwork carries `icon-<key>` and the detail
  // preview reuses it. While this platform's modal is open the name moves
  // to the modal — the card must shed it (duplicate names in a captured
  // frame make the browser skip the transition).
  const openPlatformId = useOpenDetailPlatformId();
  const vtStyle =
    openPlatformId === p.id
      ? undefined
      : { viewTransitionName: iconTransitionName(card.key) };

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

  // Badge downloads/copies target the variant currently on screen.
  const badgeDark = resolvedTheme === "dark";
  const badgeUrl = badgePath(p.id, badgeDark);
  const badgeName = `${p.id}-${badgeDark ? "dark" : "light"}.svg`;

  /** Right-click menu rows for the facet on screen. */
  const menuItems: ContextMenuItem[] = [
    {
      label: "Open details",
      icon: Maximize2,
      // Same navigation as a card click: background location + morph.
      onSelect: () =>
        navigate(`/icon/${p.id}`, { state: { background: location } }),
    },
  ];
  if (!missing) {
    if (shown === "glass" && b) {
      menuItems.push(
        {
          label: "Copy PNG",
          icon: ImageIcon,
          onSelect: () =>
            copyImage(assetPath(b.slug), `${card.title} — 1024px PNG`),
        },
        {
          label: "Download PNG 1024",
          icon: Download,
          onSelect: () => downloadAsset(assetPath(b.slug), `${b.slug}.png`),
        }
      );
      if (b.hasDark)
        menuItems.push({
          label: "Download PNG 1024 (dark)",
          icon: Moon,
          onSelect: () =>
            downloadAsset(
              assetPath(b.slug, { dark: true }),
              `${b.slug}-dark.png`
            ),
        });
      menuItems.push({
        label: "Copy embed HTML",
        icon: CodeXml,
        onSelect: () =>
          copyText(embedHtml(b), `${card.title} — <picture> embed`),
      });
    } else if (shown === "badge") {
      menuItems.push(
        {
          label: `Copy SVG (${badgeDark ? "dark" : "light"})`,
          icon: Copy,
          onSelect: () =>
            copySvg(
              badgeUrl,
              `${p.name} — ${badgeDark ? "dark" : "light"} badge SVG`
            ),
        },
        {
          label: `Download SVG (${badgeDark ? "dark" : "light"})`,
          icon: Download,
          onSelect: () => downloadAsset(badgeUrl, badgeName),
        }
      );
    } else {
      menuItems.push(
        {
          label: "Copy SVG",
          icon: Copy,
          onSelect: () => copySvg(flatPath(p.id), `${card.title} — flat SVG`),
        },
        {
          label: "Download SVG",
          icon: Download,
          onSelect: () => downloadAsset(flatPath(p.id), `${p.id}.svg`),
        }
      );
    }
  }

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      className="flex flex-col items-center justify-center rounded-md border border-neutral-200 px-3.5 py-3 hover:bg-neutral-100/80 dark:border-neutral-800 dark:hover:bg-neutral-800/20"
    >
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
          <LiveChip
            live={live}
            rmse={b.rmse}
            onToggle={() => setLive((v) => !v)}
          />
        )}
      </div>

      {/* Artwork + title open the platform detail — a real link, so
          cmd-click / middle-click / copy-link semantics work; a plain
          click carries the grid location for the modal presentation. */}
      <TransitionLink
        to={`/icon/${p.id}`}
        state={{ background: location }}
        title={`${p.name} details`}
        className="group flex w-full flex-col items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600"
      >
        <div className="flex w-full justify-center transition-transform duration-150 ease-out group-hover:scale-[1.03]">
          <div style={vtStyle} className={shown === "badge" ? "w-full" : undefined}>
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
          </div>
        </div>

        <div className="mb-3 flex flex-col items-center justify-center space-y-1">
          <p className="truncate text-balance text-center text-[15px] font-medium decoration-neutral-400 underline-offset-2 group-hover:underline">
            {title}
          </p>
        </div>
      </TransitionLink>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          label={`${p.name} actions`}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
