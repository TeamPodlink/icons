import { comparisonLabels, type CompareReference } from "@/lib/platforms";

export function ComparisonControl({ value, onChange, hasStore = true, hasAppStore = true }: {
  value: CompareReference;
  onChange: (value: CompareReference) => void;
  hasStore?: boolean;
  hasAppStore?: boolean;
}) {
  return (
    <select
      aria-label="Comparison"
      value={value}
      onChange={(event) => onChange(event.target.value as CompareReference)}
      className="max-w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <option value="glass">{comparisonLabels.glass}</option>
      {hasStore && <option value="store">{comparisonLabels.store}</option>}
      {hasAppStore && <option value="glass-store">{comparisonLabels["glass-store"]}</option>}
    </select>
  );
}
