"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Copy,
  Download,
  ImageIcon,
  Link as LinkIcon,
  Sparkles,
  Terminal,
} from "lucide-react";
import { renderBundleDataUri } from "refraction-engine";
import {
  assetPath,
  categorySlug,
  flatPath,
  shadcnCommand,
  type Card,
} from "@/lib/platforms";
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
  width: 96,
  height: 96,
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
  if (src) return <img src={src} alt={alt} {...previewCommon} className={previewCls} />;
  if (!b.hasDark)
    return (
      <img
        {...sized(false)}
        alt={alt}
        {...previewCommon}
        className={previewCls}
      />
    );
  return (
    <>
      <img
        {...sized(false)}
        alt={alt}
        {...previewCommon}
        className={cn(previewCls, "dark:hidden")}
      />
      <img
        {...sized(true)}
        alt={alt}
        {...previewCommon}
        className={cn(previewCls, "hidden dark:block")}
      />
    </>
  );
}

export function IconCard({ card }: { card: Card }) {
  const [live, setLive] = useState(false);
  const b = card.bundle;
  const liveUri = useLiquidRender(
    b?.slug ?? "",
    192,
    live && Boolean(b?.recipe)
  );

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

  const copySvg = async () => {
    const svg = await fetch(flatPath(card.platform.id)).then((r) => r.text());
    await copyText(svg, `${card.title} — flat SVG`);
  };

  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-neutral-200 px-3.5 py-3 hover:bg-neutral-100/80 dark:border-neutral-800 dark:hover:bg-neutral-800/20">
      <div className="flex h-6 w-full items-center justify-end space-x-2 pb-0.5">
        {card.facet === "flat" && (
          <span
            title="No Liquid Glass icon yet — flat vector shown. Contributions welcome!"
            className="rounded-full border border-neutral-300 px-2 py-0.5 font-mono text-[11px] text-neutral-400 dark:border-neutral-800 dark:text-neutral-500"
          >
            flat
          </span>
        )}
        {b?.hasDark && (
          <span
            title="Has a distinct dark rendition"
            className="rounded-full border border-neutral-300 px-2 py-0.5 font-mono text-[11px] text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
          >
            dark
          </span>
        )}
        {b?.recipe && (
          <button
            type="button"
            title={
              live
                ? "Showing live in-browser procedural render"
                : `Render procedurally in your browser (RMSE ${b.rmse} vs Apple's renderer)`
            }
            onClick={() => setLive((v) => !v)}
            className={cn(
              "flex cursor-pointer items-center space-x-1 rounded-full border px-2 py-0.5 font-mono text-[11px]",
              live
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-neutral-300 text-neutral-500 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500"
            )}
          >
            <Sparkles size={11} strokeWidth={1.8} />
            <span>{live ? "live" : "recipe"}</span>
          </button>
        )}
      </div>

      {card.facet === "glass" ? (
        <GlassPreview card={card} src={live && b?.recipe ? liveUri ?? undefined : undefined} />
      ) : (
        <img
          src={flatPath(card.platform.id)}
          alt={`${card.title} icon`}
          {...previewCommon}
          className={previewCls}
        />
      )}

      <div className="mb-3 flex flex-col items-center justify-center space-y-1">
        <p className="select-all truncate text-balance text-center text-[15px] font-medium">
          {card.title}
        </p>
        <div className="flex h-6 items-center justify-center space-x-1">
          {card.categories.slice(0, 2).map((c) => (
            <Link
              key={c}
              href={`/directory/${categorySlug(c)}`}
              className="cursor-pointer rounded-full border border-neutral-200 px-2 py-0.5 font-mono text-xs font-medium text-neutral-600 hover:border-neutral-400 hover:text-black dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-white"
            >
              {c}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center space-x-0.5">
        {card.facet === "glass" ? (
          <>
            <button
              type="button"
              title={`Copy shadcn command — ${shadcnCommand(b!.slug)}`}
              onClick={() => copyText(shadcnCommand(b!.slug), shadcnCommand(b!.slug))}
              className={actionBtn}
            >
              <Terminal size={16} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              title="Copy 1024px PNG to clipboard"
              onClick={copyImage}
              className={actionBtn}
            >
              <ImageIcon size={16} strokeWidth={1.8} />
            </button>
            <a
              href={assetPath(b!.slug)}
              download={`${b!.slug}.png`}
              title="Download 1024px PNG"
              className={actionBtn}
            >
              <Download size={16} strokeWidth={1.8} />
            </a>
          </>
        ) : (
          <>
            <button
              type="button"
              title="Copy flat SVG"
              onClick={copySvg}
              className={actionBtn}
            >
              <Copy size={16} strokeWidth={1.8} />
            </button>
            <a
              href={flatPath(card.platform.id)}
              download={`${card.platform.id}.svg`}
              title="Download flat SVG"
              className={actionBtn}
            >
              <Download size={16} strokeWidth={1.8} />
            </a>
          </>
        )}
        {card.platform.url && (
          <a
            href={card.platform.url}
            target="_blank"
            rel="noreferrer"
            title={`${card.platform.name} website`}
            className={actionBtn}
          >
            <LinkIcon size={16} strokeWidth={1.8} />
          </a>
        )}
      </div>
    </div>
  );
}
