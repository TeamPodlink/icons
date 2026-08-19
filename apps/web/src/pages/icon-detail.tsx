import { useEffect } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import { X } from "lucide-react";
import { IconDetail } from "@/components/icon-detail";
import { PageCard } from "@/components/page-card";
import { resolvePlatform } from "@/lib/platforms";
import { useTitle } from "@/lib/use-title";
import { NotFound } from "@/src/pages/not-found";

const closeBtn =
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-neutral-600 outline-none hover:bg-neutral-200 hover:text-black focus-visible:ring-2 focus-visible:ring-neutral-400 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white dark:focus-visible:ring-neutral-600";

/**
 * Direct-load presentation of /icon/:id: a full page (no grid modal).
 * Alias ids canonicalize with a replace-navigation; unknown ids get the
 * site 404.
 */
export function IconDetailPage() {
  const { id = "" } = useParams();
  const platform = resolvePlatform(id);
  useTitle(platform ? `${platform.name} · refraction` : "Not found · refraction");
  if (!platform) return <NotFound />;
  if (platform.id !== id)
    return <Navigate to={`/icon/${platform.id}`} replace />;
  return (
    <PageCard>
      <div className="mx-auto max-w-2xl py-4">
        <div className="px-6 pt-4 sm:px-8">
          <Link
            to="/"
            className="text-sm text-neutral-600 underline decoration-neutral-400 underline-offset-2 hover:text-black dark:text-neutral-400 dark:hover:text-white"
          >
            ← Back to the directory
          </Link>
        </div>
        <IconDetail platform={platform} />
      </div>
    </PageCard>
  );
}

/**
 * Modal presentation of /icon/:id, rendered over the grid when the
 * navigation carried a background location (card click). Closing is
 * navigate(-1) — backdrop click, the X, or Escape — which returns to the
 * background entry, so the grid's search/sort/scroll survive untouched.
 */
export function IconDetailModal() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const platform = resolvePlatform(id);
  useTitle(
    platform ? `${platform.name} · refraction` : "Not found · refraction",
    true
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate(-1);
    };
    document.addEventListener("keydown", onKey);
    // Belt-and-braces scroll lock (the grid scrolls inside PageCard, but
    // lock the body too so nothing behind the overlay can move).
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [navigate]);

  // Alias deep link opened as a modal: canonicalize, keeping the
  // background state so the modal presentation survives the replace.
  if (platform && platform.id !== id)
    return (
      <Navigate to={`/icon/${platform.id}`} replace state={location.state} />
    );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={platform ? `${platform.name} icon details` : "Icon details"}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      <div
        aria-hidden="true"
        onClick={() => navigate(-1)}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <button
          type="button"
          aria-label="Close"
          title="Close"
          autoFocus
          onClick={() => navigate(-1)}
          className={`absolute right-3 top-3 z-10 ${closeBtn}`}
        >
          <X size={18} strokeWidth={1.8} />
        </button>
        <div className="overflow-y-auto">
          {platform ? (
            <IconDetail platform={platform} />
          ) : (
            <div className="flex flex-col items-center justify-center space-y-2 px-6 py-20 text-center">
              <p className="font-mono text-sm text-neutral-500 dark:text-neutral-400">
                404
              </p>
              <p className="text-lg font-medium">Icon not found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
