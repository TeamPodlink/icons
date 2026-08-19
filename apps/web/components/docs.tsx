import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCheck, ChevronDown, Copy, FileText } from "lucide-react";
import { PageCard } from "@/components/page-card";
import { cn } from "@/lib/cn";
import { copyText } from "@/lib/asset-actions";
import { domToMarkdown } from "@/lib/dom-markdown";

export function Code({ children }: { children: React.ReactNode }) {
  return <pre className="font-mono">{children}</pre>;
}

/** Section titles double as anchor ids, so the TOC needs no registration
 *  plumbing — it just reads the headings the article rendered. */
function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface Heading {
  id: string;
  text: string;
}

/** Scroll a heading to the top of the PageCard viewport. `scrollIntoView`
 *  walks to the nearest scrollable ancestor, which is that viewport — the
 *  window never scrolls on this site. */
function scrollToHeading(id: string) {
  const heading = document.getElementById(id);
  if (!heading) return false;
  heading.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

function TocLinks({
  headings,
  active,
  onJump,
}: {
  headings: Heading[];
  active: string | null;
  onJump: (id: string) => void;
}) {
  return (
    <nav className="flex flex-col text-sm text-neutral-600 dark:text-neutral-400">
      {headings.map((h) => (
        <a
          key={h.id}
          href={`#${h.id}`}
          onClick={(e) => {
            e.preventDefault();
            onJump(h.id);
          }}
          className={cn(
            "pb-1.5 pt-1 font-medium transition-colors hover:text-neutral-900 dark:hover:text-neutral-50",
            active === h.id && "text-neutral-900 dark:text-neutral-50"
          )}
        >
          {h.text}
        </a>
      ))}
    </nav>
  );
}

export function DocsPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  const articleRef = useRef<HTMLElement | null>(null);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The rendered article is the only heading source: scan it in document
  // order after every content change.
  useLayoutEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    setHeadings(
      Array.from(article.querySelectorAll<HTMLHeadingElement>("h2[id]")).map(
        (h) => ({ id: h.id, text: h.textContent ?? "" })
      )
    );
  }, [children]);

  // Honor an incoming #hash on first paint (a shared TOC link).
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || headings.length === 0) return;
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (!id) return;
    landed.current = scrollToHeading(id);
    if (landed.current) setActive(id);
  }, [headings]);

  // Scroll spy: a heading is active while it sits in the band just under
  // the sticky header; when the band is empty the last one to pass through
  // it stays lit.
  useEffect(() => {
    const article = articleRef.current;
    if (!article || headings.length === 0) return;
    const root = article.closest<HTMLElement>(".overflow-y-auto") ?? null;
    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = headings.find((h) => visible.has(h.id));
        if (first) setActive(first.id);
      },
      { root, rootMargin: "-56px 0px -70% 0px", threshold: 0 }
    );
    for (const h of headings) {
      const node = document.getElementById(h.id);
      if (node) io.observe(node);
    }
    // A short final section never reaches the band; at the end of the
    // scroll the last heading is the honest answer.
    const onScroll = () => {
      if (!root) return;
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2)
        setActive(headings[headings.length - 1].id);
    };
    root?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      root?.removeEventListener("scroll", onScroll);
    };
  }, [headings]);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    []
  );

  // Collapsing the mobile TOC removes content above the article, so a jump
  // made from it has to wait for that layout to settle or it lands short.
  const pendingJump = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (tocOpen || !pendingJump.current) return;
    const id = pendingJump.current;
    pendingJump.current = null;
    scrollToHeading(id);
  }, [tocOpen]);

  const jump = (id: string) => {
    if (!document.getElementById(id)) return;
    setActive(id);
    // Keep the anchor shareable without handing the router a navigation.
    window.history.replaceState(window.history.state, "", `#${id}`);
    if (tocOpen) {
      pendingJump.current = id;
      setTocOpen(false);
      return;
    }
    scrollToHeading(id);
  };

  const copyPage = async () => {
    const article = articleRef.current;
    if (!article) return;
    const ok = await copyText(domToMarkdown(article), `${title} · Markdown`);
    if (!ok) return;
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <PageCard>
      <div className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-neutral-200 bg-white/80 px-4 py-1.5 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/40">
        <div className="flex min-w-0 items-center space-x-1.5 text-neutral-950 dark:text-neutral-50">
          <FileText size={18} strokeWidth={1.5} className="shrink-0" />
          <span className="truncate text-sm font-medium">{title}</span>
        </div>
        <button
          type="button"
          onClick={copyPage}
          title="Copy this page as Markdown"
          className="flex cursor-pointer items-center space-x-1.5 rounded-md px-2 py-1.5 text-sm text-neutral-600 hover:bg-neutral-200 hover:text-black dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
        >
          {copied ? (
            <CheckCheck size={16} strokeWidth={1.8} />
          ) : (
            <Copy size={16} strokeWidth={1.8} />
          )}
          <span>Copy Page</span>
        </button>
      </div>

      {/* Mobile TOC: a flush bar under the header, spanning the card
          (svgl's docs collapsible — rounded-none, side/top borders off). */}
      {headings.length > 0 && (
        <div className="block lg:hidden">
          <button
            type="button"
            aria-expanded={tocOpen}
            onClick={() => setTocOpen((v) => !v)}
            className="flex w-full cursor-pointer items-center justify-between border-b border-neutral-200 px-4 py-2.5 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800/40"
          >
            <span>On this page</span>
            <ChevronDown
              size={16}
              strokeWidth={1.8}
              className={cn(
                "text-neutral-500 transition-transform duration-200",
                tocOpen && "rotate-180"
              )}
            />
          </button>
          {tocOpen && (
            <div className="border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
              <TocLinks headings={headings} active={active} onJump={jump} />
            </div>
          )}
        </div>
      )}

      {/* svgl's docs row: the article centers itself inside the free
          space (mx-auto + its own padding) while the rail hugs the card's
          right edge — no shared max-width wrapper around the pair. */}
      <div className="flex gap-8 lg:gap-12">
        <article
          ref={articleRef}
          className="docs-prose mx-auto mb-6 mt-8 w-full max-w-3xl flex-1 px-6 lg:px-4"
        >
          <div>
            <h1>{title}</h1>
            <p className="text-center text-neutral-600 dark:text-neutral-400">
              {intro}
            </p>
          </div>
          {children}
        </article>

        {headings.length > 0 && (
          <aside className="sticky top-20 mt-8 hidden w-60 flex-shrink-0 self-start pr-6 lg:block lg:pr-4">
            <p className="mb-2 text-sm font-medium">On this page</p>
            <TocLinks headings={headings} active={active} onJump={jump} />
          </aside>
        )}
      </div>
    </PageCard>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 id={slugify(title)}>{title}</h2>
      {children}
    </section>
  );
}

/** Inline link for docs prose; external URLs open in a new tab. */
export function A({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const external = href.startsWith("http");
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      {children}
    </a>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}
