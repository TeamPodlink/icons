import { Link, useLocation } from "react-router";
import {
  BookOpen,
  GitPullRequest,
  Megaphone,
  Package,
  PenTool,
  Scale,
  StretchHorizontal,
} from "lucide-react";

import { MaterialsIcon } from "@/components/materials-icon";
import { categorySlug, facetCounts, getCategories } from "@/lib/platforms";
import { ScrollFade } from "@/components/scroll-fade";
import { cn } from "@/lib/cn";

const itemBase =
  "flex h-8 w-full items-center justify-between space-x-3 rounded-md px-2 py-1.5 text-sm text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white";
const itemActive =
  "rounded-lg border border-neutral-200 bg-white font-medium text-black shadow-sm dark:border-neutral-800 dark:bg-neutral-800 dark:text-white";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-lg border border-neutral-300 bg-white px-2 py-0.5 font-mono text-xs font-medium text-neutral-600 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
      {children}
    </span>
  );
}

export function Sidebar() {
  const { pathname, search } = useLocation();
  // Facet switches keep the visitor's search/sort context (docs links stay clean).
  const carry = (href: string) => href + search;
  const categories = getCategories();

  // The three facets are the navigation.
  const links = [
    { href: "/", label: "Liquid Glass", icon: MaterialsIcon, badge: facetCounts.glass },
    { href: "/vector", label: "Vector", icon: PenTool, badge: facetCounts.flat },
    { href: "/badges", label: "Badge", icon: StretchHorizontal, badge: facetCounts.badge },
  ];

  const docs = [
    { href: "/docs/guide", label: "Guide", icon: BookOpen },
    { href: "/docs/packages", label: "Packages", icon: Package },
    { href: "/docs/legal", label: "Legal", icon: Scale },
    { href: "/docs/contributing", label: "Contributing", icon: GitPullRequest },
    { href: "/docs/showcase", label: "Showcase", icon: Megaphone },
  ];

  return (
    <aside className="w-54 hidden h-[calc(100vh-4.5rem)] flex-col space-y-3 overflow-x-hidden bg-neutral-100 px-2 md:fixed md:left-1 md:flex dark:bg-neutral-950">
      <nav className="flex flex-col space-y-0.5">
        {links.map(({ href, label, icon: Icon, badge }) => (
          <Link
            key={href}
            to={carry(href)}
            className={cn(itemBase, pathname === href && itemActive)}
          >
            <span className="flex items-center space-x-2">
              <Icon size={16} strokeWidth={1.8} />
              <span>{label}</span>
            </span>
            {badge !== undefined && <Badge>{badge}</Badge>}
          </Link>
        ))}
      </nav>
      <div className="h-px w-full bg-neutral-200 dark:bg-neutral-800" />
      <nav className="flex flex-col space-y-0.5">
        {docs.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            to={href}
            className={cn(itemBase, pathname === href && itemActive)}
          >
            <span className="flex items-center space-x-2">
              <Icon size={16} strokeWidth={1.8} />
              <span>{label}</span>
            </span>
          </Link>
        ))}
      </nav>
      <div className="h-px w-full bg-neutral-200 dark:bg-neutral-800" />
      <ScrollFade
        className="min-h-0 flex-1"
        viewportClassName="pb-6"
      >
        <nav className="flex flex-col space-y-0.5">
        {categories.map((c) => {
          const href = `/directory/${categorySlug(c.name)}`;
          return (
            <Link
              key={c.name}
              to={href}
              className={cn(itemBase, pathname === href && itemActive)}
            >
              <span className="truncate">{c.name}</span>
              <Badge>{c.count}</Badge>
            </Link>
          );
        })}
        </nav>
      </ScrollFade>
    </aside>
  );
}
