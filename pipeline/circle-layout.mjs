// Persist computed layout as native Icon Composer platform specializations.
// The .icon bundle then renders correctly without our staging/build code.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fitCircleSafeArea } from "./circle-safe-area.mjs";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

export function specializeWatchOS(object, property, value, fallback) {
  const key = `${property}-specializations`;
  const specs = object[key] ?? [{ value: object[property] ?? fallback }];
  object[key] = [
    ...specs.filter((spec) => spec.idiom !== "watchOS"),
    { idiom: "watchOS", value },
  ];
  // Icon Composer prefers a direct property over its specialization array.
  delete object[property];
}

export async function syncCircleSafeArea(bundle) {
  const policyPath = join(bundle, "circle-layout.json");
  if (!existsSync(policyPath)) return;
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  if (!policy.safeArea) throw new Error(`Missing safeArea policy: ${policyPath}`);
  const path = join(bundle, "icon.json");
  const original = readFileSync(path, "utf8");
  const doc = JSON.parse(original);
  const measured = structuredClone(doc);
  // Fit the authored baseline, never the previous computed watchOS size.
  for (const layer of measured.groups.flatMap((g) => g.layers ?? [])) {
    if (!policy.safeArea.layers.includes(layer.name)) continue;
    const specs = layer["position-specializations"] ?? [];
    if (specs.some((s) => s.appearance || (s.idiom && s.idiom !== "watchOS")))
      throw new Error(`Unsupported baseline position specialization: ${layer.name}`);
    const base = specs.find((s) => !s.idiom)?.value;
    if (base) layer.position = base;
    delete layer["position-specializations"];
  }
  const fit = await fitCircleSafeArea(measured, bundle, policy.safeArea);
  for (const name of policy.safeArea.layers) {
    const layer = doc.groups.flatMap((g) => g.layers ?? []).find((l) => l.name === name);
    const fitted = measured.groups.flatMap((g) => g.layers ?? []).find((l) => l.name === name);
    specializeWatchOS(layer, "position", fitted.position, { scale: 1, "translation-in-points": [0, 0] });
  }
  doc["supported-platforms"] = { ...doc["supported-platforms"], circles: ["watchOS"] };
  const next = JSON.stringify(doc, null, 2) + "\n";
  if (next !== original) writeFileSync(path, next);
  if (policy.vector) {
    // The Vector foreground is the same native layer geometry, on a 32-unit
    // canvas. Apply the computed factor to its dedicated group, not its plate.
    const vectorPath = join(bundle, "..", "icon-circle.svg");
    const source = readFileSync(vectorPath, "utf8");
    const svg = new DOMParser().parseFromString(source, "image/svg+xml");
    const groups = Array.from(svg.getElementsByTagName("g")).filter((g) => g.getAttribute("id") === policy.vector.group);
    if (groups.length !== 1) throw new Error(`Expected one Vector safe-area group: ${vectorPath}`);
    groups[0].setAttribute("transform", `translate(16 16) scale(${fit.scale}) translate(-16 -16)`);
    const result = new XMLSerializer().serializeToString(svg);
    if (result !== source) writeFileSync(vectorPath, result);
  }
  return fit;
}
