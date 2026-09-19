import { useLayoutEffect, useState } from "react";
import { Maximize2, SquareArrowOutUpRight } from "lucide-react";
import {
  ContextMenu,
  type ContextMenuItem,
} from "@/components/context-menu";
import { TransitionLink } from "@/components/transition-link";
import { menuItemsFor } from "@/lib/asset-menus";
import { CompareArtwork } from "@/components/icon-detail";
import {
  assetFacetOf,
  assetPath,
  badgePath,
  flatPath,
  lensesEnabled,
  rasterPath,
  type Card,
  type GridFacet,
} from "@/lib/platforms";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/cn";
import {
  CARD_VT_ATTR,
  CELL_VT_ATTR,
  consumePendingReturnKey,
  nameCardForTransition,
  useTransitionNavigate,
} from "@/lib/view-transition";

const previewCls = "pointer-events-none mb-4 mt-1.5 h-24 w-24 select-none";
const previewCommon = {
  loading: "lazy" as const,
  decoding: "async" as const,
};

function GlassPreview({ card }: { card: Card }) {
  const b = card.bundle!;
  const alt = `${card.title} app icon`;
  // 96px box: 128 rendition on 1x displays, 256 on 2x.
  const sized = (dark: boolean) => ({
    src: assetPath(b.slug, { size: 128, dark }),
    srcSet: `${assetPath(b.slug, { size: 128, dark })} 1x, ${assetPath(b.slug, { size: 256, dark })} 2x`,
  });
  const common = { ...previewCommon, width: 96, height: 96 };
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

/** Dev-only compare tile: the drift audit's 4×|glass − vector| panel in
 *  the glass card's box (CompareArtwork in its compact form). */
function ComparePreview({ card }: { card: Card }) {
  return (
    <div className={previewCls}>
      <CompareArtwork platform={card.platform} bundle={card.bundle!} compact />
    </div>
  );
}

/** Dev-only raster tile: the store's own artwork (App Store 1024, or
 *  Google Play 512 for an Android-only platform), under the iOS corner
 *  radius so it reads beside the glass renditions. */
function RasterPreview({ card }: { card: Card }) {
  return (
    <img
      src={rasterPath(card.bundle!.slug)}
      alt={`${card.title} store icon`}
      {...previewCommon}
      width={96}
      height={96}
      className={cn(previewCls, "rounded-[22.5%]")}
    />
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
  facet?: GridFacet;
}) {
  const navigate = useTransitionNavigate();
  // Menu actions resolve to the rendition on screen (theme-scoped).
  const darkTheme = useTheme().resolvedTheme === "dark";
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const b = card.bundle;
  const p = card.platform;

  // Shared-element morph: the artwork carries no view-transition-name at
  // rest (a named element is lifted above the root snapshot in every
  // transition — 70 lifted cards would paint over the incoming detail).
  // Navigations to the detail name this one card imperatively for just
  // the transition window; the data attributes are the lookup handles.
  // The detail opens on the facet the grid was showing: /vector and
  // /badges carry ?facet= so tapping through never snaps back to glass.
  const detailHref =
    facet === "glass"
      ? `/icon/${p.id}`
      : `/icon/${p.id}?facet=${facet === "flat" ? "vector" : facet}`;

  const openDetails = () => {
    nameCardForTransition(card.key);
    navigate(detailHref);
  };

  // Return morph: the detail's back handler records this card's key
  // before navigating; consuming it here — a layout effect inside the
  // router's commit, before the new-state capture — names the freshly
  // mounted cell + artwork so the hero has a destination to shrink into.
  useLayoutEffect(() => {
    if (consumePendingReturnKey(card.key)) nameCardForTransition(card.key);
  }, [card.key]);

  // What this card actually shows: the glass view falls back to the flat
  // vector for platforms that have no glass bundle yet (card.facet).
  const shown: GridFacet =
    facet === "glass" ? (card.facet === "glass" ? "glass" : "flat") : facet;
  const missing =
    (shown === "flat" && !p.hasFlat) || (shown === "badge" && !p.hasBadge);

  const title = facet === "flat" || facet === "badge" ? p.name : card.title;

  /** Right-click menu: "Open details", then exactly the detail hero's
   *  menu (lib/asset-menus.ts menuItemsFor — Copy ▸ / Download ▸ / dev
   *  Open in Finder), so the two views can never disagree. A compare
   *  card acts on the glass bundle's assets, as the detail's compare
   *  segment does. */
  const menuItems: ContextMenuItem[] = [
    {
      label: "Open details",
      icon: Maximize2,
      // Same navigation as a card click: background location + morph.
      onSelect: openDetails,
    },
    ...(missing ? [] : menuItemsFor(assetFacetOf(shown), p, b, darkTheme)),
  ];

  return (
    <div
      {...{ [CELL_VT_ATTR]: card.key }}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      className="group relative flex flex-col items-center justify-center rounded-md border border-neutral-200 px-3.5 py-3 hover:bg-neutral-100/80 dark:border-neutral-800 dark:hover:bg-neutral-800/20"
    >
      <div className="flex h-6 w-full items-center justify-end space-x-2 pb-0.5">
        {/* Dev-only facet-drift readout (central RMSE between the light
            Liquid Glass master and the flat, apps/web/lib/facet-drift.json),
            gated like the QA lenses so a production build drops it. */}
        {lensesEnabled && card.drift !== null && (
          <span
            title="Facet drift: central RMSE, light Liquid Glass master vs flat icon (pipeline/audit-facet-drift.mjs)"
            className={cn(
              "rounded-full border px-2 py-0.5 font-mono text-[11px] tabular-nums",
              card.drift <= 5
                ? "border-emerald-300 text-emerald-600 dark:border-emerald-900 dark:text-emerald-500"
                : "border-neutral-300 text-neutral-400 dark:border-neutral-800 dark:text-neutral-500"
            )}
          >
            {card.drift.toFixed(2)}
          </span>
        )}
        {/* Material pairs carry a second figure: the same audit against the
            bundle with its glass material off (--material-off), i.e. what
            the flat gets wrong once the sheen is out of the picture. */}
        {lensesEnabled && card.driftMaterialOff !== null && (
          <span
            title="Facet drift with the bundle's material off: central RMSE, flat vs the layer stack rendered without glass/specular/translucency/shadow (pipeline/audit-facet-drift.mjs --material-off)"
            className={cn(
              "rounded-full border px-2 py-0.5 font-mono text-[11px] tabular-nums",
              card.driftMaterialOff <= 5
                ? "border-emerald-300 text-emerald-600 dark:border-emerald-900 dark:text-emerald-500"
                : "border-neutral-300 text-neutral-400 dark:border-neutral-800 dark:text-neutral-500"
            )}
          >
            off {card.driftMaterialOff.toFixed(2)}
          </span>
        )}
        {shown === "flat" && facet === "glass" && (
          <span
            title="No Liquid Glass icon yet — flat vector shown. Contributions welcome!"
            className="rounded-full border border-neutral-300 px-2 py-0.5 font-mono text-[11px] text-neutral-400 dark:border-neutral-800 dark:text-neutral-500"
          >
            flat
          </span>
        )}
      </div>

      <div className="flex w-full justify-center transition-transform duration-150 ease-out group-hover:scale-[1.03]">
        <div
          {...{ [CARD_VT_ATTR]: card.key }}
          className={shown === "badge" ? "w-full" : undefined}
        >
          {missing ? (
            <MissingPreview
              label={shown === "flat" ? "missing flat" : "missing badge"}
            />
          ) : shown === "glass" ? (
            <GlassPreview card={card} />
          ) : shown === "badge" ? (
            <BadgePreview card={card} />
          ) : shown === "compare" ? (
            <ComparePreview card={card} />
          ) : shown === "raster" ? (
            <RasterPreview card={card} />
          ) : (
            <FlatPreview card={card} />
          )}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-center space-x-1.5">
        <p className="truncate text-balance text-center text-[15px] font-medium">
          {title}
        </p>
        {/* Website link: above the stretched card link (z-10) and out of
            the morphing artwork wrapper; clicking it opens the site, not
            the detail. */}
        {p.url && (
          <a
            href={p.url}
            target="_blank"
            rel="noreferrer noopener"
            title={`${p.name} website`}
            aria-label={`${p.name} website`}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 shrink-0 text-neutral-400 hover:text-black dark:text-neutral-500 dark:hover:text-white"
          >
            <SquareArrowOutUpRight size={13} strokeWidth={1.8} />
          </a>
        )}
      </div>

      {/* Stretched link: the whole cell is the click target, and it's a
          real anchor so cmd/middle-click and copy-link semantics keep
          working (right-click bubbles to the cell's context menu). */}
      <TransitionLink
        to={detailHref}
        aria-label={`${p.name} details`}
        title={`${p.name} details`}
        onClick={(e) => {
          // Name the artwork only for the navigation the link will run
          // itself — modified clicks (new tab) morph nothing.
          if (
            e.button === 0 &&
            !e.metaKey &&
            !e.altKey &&
            !e.ctrlKey &&
            !e.shiftKey
          )
            nameCardForTransition(card.key);
        }}
        className="absolute inset-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600"
      />

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
