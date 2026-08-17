import Link from "next/link";
import { Github } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const REPO_URL = "https://github.com/TeamPodlink/icons";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full bg-neutral-100 px-2 py-3 md:px-4 md:py-4 dark:bg-neutral-950">
      <nav className="flex w-full items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <Logo size={28} />
          <h2 className="text-xl font-medium tracking-tight">refraction</h2>
          <span className="mt-0.5 hidden text-sm text-neutral-500 sm:block dark:text-neutral-400">
            podcast app icons · by Podlink
          </span>
        </Link>
        <div className="flex h-5 items-center space-x-2.5">
          <ThemeToggle />
          <div className="hidden h-5 w-px bg-neutral-300 md:block dark:bg-neutral-800" />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center space-x-1.5 rounded-md px-2 py-1.5 text-sm text-neutral-600 hover:bg-neutral-200 hover:text-black md:flex dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
          >
            <Github size={18} strokeWidth={1.8} />
            <span className="font-mono text-sm tracking-tight">GitHub</span>
          </a>
        </div>
      </nav>
    </header>
  );
}
