import survey from "@/lib/icon-spec-survey.json";

type KeyInfo = {
  firstParty: number;
  catalog: number;
  types: string[];
  values?: Record<string, number>;
  moreValues?: boolean;
  range?: number[];
  arrayLen?: number[];
};

const GROUPS: [string, (kp: string) => boolean][] = [
  ["Document root", (kp) => !kp.includes(".") && !kp.includes("[")],
  ["Canvas fill", (kp) => kp.startsWith("fill")],
  [
    "Groups",
    (kp) => kp.startsWith("groups") && !kp.startsWith("groups[].layers"),
  ],
  ["Layers", (kp) => kp.startsWith("groups[].layers")],
  ["Platforms & features", (kp) => kp.startsWith("supported-platforms") || kp.startsWith("features")],
];

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function observed(info: KeyInfo): string {
  if (info.values) {
    const vals = Object.keys(info.values).slice(0, 5);
    const shown = vals
      .map((v) => (v.length > 34 ? v.slice(0, 32) + "…" : v))
      .join(" · ");
    return shown + (info.moreValues || Object.keys(info.values).length > 5 ? " · …" : "");
  }
  if (info.range) return `${fmt(info.range[0])} – ${fmt(info.range[1])}`;
  if (info.arrayLen)
    return info.arrayLen[0] === info.arrayLen[1]
      ? `${info.arrayLen[0]} items`
      : `${info.arrayLen[0]}–${info.arrayLen[1]} items`;
  return "";
}

export function SpecFieldTable() {
  const keys = Object.entries(survey.keys as Record<string, KeyInfo>);
  const seen = new Set<string>();
  const { firstParty, catalog } = survey.sources;

  return (
    <div className="space-y-6">
      {GROUPS.map(([title, match]) => {
        const rows = keys.filter(([kp]) => !seen.has(kp) && match(kp));
        rows.forEach(([kp]) => seen.add(kp));
        if (!rows.length) return null;
        return (
          <div key={title}>
            <h3 className="mb-2 text-sm font-medium">{title}</h3>
            <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
              <table className="w-full font-mono text-[12px]">
                <thead className="bg-neutral-50 text-left dark:bg-neutral-950/60">
                  <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                    <th>key path</th>
                    <th title={`of ${firstParty} first-party icons`}>1st&nbsp;party</th>
                    <th title={`of ${catalog} catalog icons`}>catalog</th>
                    <th>type</th>
                    <th>observed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([kp, info]) => (
                    <tr
                      key={kp}
                      className="border-t border-neutral-200 align-top text-neutral-600 dark:border-neutral-800 dark:text-neutral-400 [&>td]:px-3 [&>td]:py-1.5"
                    >
                      <td className="whitespace-nowrap">{kp}</td>
                      <td>{info.firstParty}</td>
                      <td>{info.catalog}</td>
                      <td>{info.types.filter((t) => t !== "null").join("|")}</td>
                      <td className="min-w-72 max-w-105">{observed(info)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
