import { Link } from "react-router";
import { PageCard } from "@/components/page-card";
import { useTitle } from "@/lib/use-title";

export function NotFound() {
  useTitle("Not found · refraction");
  return (
    <PageCard>
      <div className="flex min-h-[calc(100vh-4.5rem)] flex-col items-center justify-center space-y-3 text-center">
        <p className="font-mono text-sm text-neutral-500 dark:text-neutral-400">
          404
        </p>
        <p className="text-lg font-medium">Page not found</p>
        <Link
          to="/"
          className="text-sm text-neutral-600 underline decoration-neutral-400 underline-offset-2 hover:text-black dark:text-neutral-400 dark:hover:text-white"
        >
          Back to the directory
        </Link>
      </div>
    </PageCard>
  );
}
