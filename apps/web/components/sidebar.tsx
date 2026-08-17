"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Braces, Cloud, House, Package, Server, Sparkles } from "lucide-react";
import { cards, categorySlug, getCategories, glassCards } from "@/lib/platforms";
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
  const pathname = usePathname();
  const categories = getCategories();

  const links = [
    { href: "/", label: "Home", icon: House, badge: cards.length },
    {
      href: "/liquid-glass",
      label: "Liquid Glass",
      icon: Sparkles,
      badge: glassCards.length,
    },
    { href: "/docs/registry", label: "Registry", icon: Package },
    { href: "/docs/self-hosting", label: "Self-hosting", icon: Server },
    { href: "/docs/api", label: "API", icon: Cloud },
    { href: "/docs/icon-format", label: ".icon Format", icon: Braces },
  ];

  return (
    <aside className="w-54 hidden h-[calc(100vh-4.5rem)] flex-col space-y-3 overflow-x-hidden bg-neutral-100 px-2 md:fixed md:left-1 md:flex dark:bg-neutral-950">
      <nav className="flex flex-col space-y-0.5">
        {links.map(({ href, label, icon: Icon, badge }) => (
          <Link
            key={href}
            href={href}
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
      <nav className="scroll-mask flex flex-col space-y-0.5 overflow-y-auto pb-6">
        {categories.map((c) => {
          const href = `/directory/${categorySlug(c.name)}`;
          return (
            <Link
              key={c.name}
              href={href}
              className={cn(itemBase, pathname === href && itemActive)}
            >
              <span className="truncate">{c.name}</span>
              <Badge>{c.count}</Badge>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
