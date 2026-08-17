import { PageCard } from "@/components/page-card";

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-4 font-mono text-[13px] leading-relaxed dark:border-neutral-800 dark:bg-neutral-950/60">
      {children}
    </pre>
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
  return (
    <PageCard>
      <article className="mx-auto my-10 max-w-3xl space-y-8 px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">{intro}</p>
        </div>
        {children}
      </article>
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
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{title}</h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
      {children}
    </p>
  );
}
