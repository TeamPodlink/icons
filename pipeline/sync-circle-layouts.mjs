// Keep Vector Circle layouts aligned with the policies stored in .icon bundles.
import { readBundles } from "./lib.mjs";
import { syncCircleSafeArea } from "./circle-layout.mjs";

for (const bundle of readBundles()) {
  const fit = await syncCircleSafeArea(bundle.bundlePath);
  if (fit) console.log(`Circle safe area ${bundle.platformId}: ${fit.scale.toFixed(6)}`);
}
