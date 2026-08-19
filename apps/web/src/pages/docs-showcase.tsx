import { A, DocsPage, P, Section } from "@/components/docs";
import { useTitle } from "@/lib/use-title";

const REPO_URL = "https://github.com/TeamPodlink/icons";

interface ShowcaseEntry {
  name: string;
  url: string;
  description: string;
}

/** Sites using the collection — add yours via PR (keep alphabetical). */
const SHOWCASE: ShowcaseEntry[] = [
  {
    name: "Podnews",
    url: "https://podnews.net",
    description:
      "Daily news for the podcast and on-demand audio industry.",
  },
];

export function ShowcaseDocs() {
  useTitle("Showcase · refraction");
  return (
    <DocsPage
      title="Showcase"
      intro="Sites and apps using the collection in production."
    >
      {/* Custom cards: opt out of the prose link styling. */}
      <div className="not-prose grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
        {SHOWCASE.map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col space-y-1 rounded-md border border-neutral-200 px-4 py-3 hover:bg-neutral-100/80 dark:border-neutral-800 dark:hover:bg-neutral-800/20"
          >
            <span className="text-[15px] font-medium">{s.name}</span>
            <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
              {s.url.replace(/^https?:\/\//, "")}
            </span>
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              {s.description}
            </span>
          </a>
        ))}
      </div>

      <Section title="Add your site">
        <P>
          Using these icons somewhere? Open a PR against{" "}
          <A href={REPO_URL}>the repo</A> adding your site to the list on
          this page (<code>apps/web/src/pages/docs-showcase.tsx</code>) —
          name, URL, and a one-line description.
        </P>
      </Section>
    </DocsPage>
  );
}
