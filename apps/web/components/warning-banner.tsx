import { useState } from "react";
import { Check, TriangleAlert } from "lucide-react";

const STORAGE_KEY = "refraction_warning";

/** Acknowledge-once artwork notice (SVGL's pattern, MIT — pheralb/svgl
 *  warningMessage.svelte): shown until the visitor accepts; acceptance
 *  persists per-browser in localStorage. */
export function WarningBanner() {
  const [accepted, setAccepted] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "true"
  );
  if (accepted) return null;

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setAccepted(true);
  };

  return (
    <div className="flex w-full flex-col items-center justify-between space-y-2 border-b border-neutral-200 bg-white px-4 py-4 text-sm md:flex-row md:space-x-2 md:space-y-0 md:py-2 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col items-center gap-2 md:flex-row">
        <TriangleAlert
          size={18}
          strokeWidth={2}
          className="shrink-0 animate-pulse text-yellow-600 dark:text-yellow-500"
        />
        <p>
          Each icon includes a link to its respective product. Permission must
          be obtained before using a logo. For removal requests,{" "}
          <a
            href="https://github.com/TeamPodlink/icons/issues/new"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-neutral-500 underline-offset-4"
          >
            please open an issue on GitHub
          </a>
          .
        </p>
      </div>
      <button
        type="button"
        onClick={accept}
        className="flex shrink-0 cursor-pointer items-center space-x-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-300"
      >
        <Check size={14} strokeWidth={2} />
        <span>Accept</span>
      </button>
    </div>
  );
}
