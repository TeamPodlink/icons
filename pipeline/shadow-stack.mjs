// shadow-stack.mjs — filter-free gaussian blur of an SVG shape for ictool bundles (used by hand for
// antennapod, gpodder, castro; ledger "antennapod: the official shadow without a filter" and
// "gpodder and castro off the raster lens", 2026-09-19). Import shadowStack() from a one-off build script.
// Filter-free gaussian blur of an arbitrary SVG shape for ictool: K offset copies of the shape from +2.5σ to −2.5σ —
// dilations as the shape plus a round-joined stroke of width 2e, erosions as the shape under a mask of its own white
// fill with a black stroke of width 2|e| — whose opacities stack to `opacity` × the gaussian CDF. No enclosing opacity
// group: ictool applies a group's opacity to each opacity-bearing child and again to the composite (ledger 2026-09-19).
// `paths`: array of path d strings (must not overlap); units are the caller's user space; σ/dx/dy in the same units.
const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
// `bandWidth`: the shape's local thickness (2 × its max inscribed distance). A feature thinner than ~4σ never reaches
// full coverage under a true blur; with it set, the target at nearest-edge distance d (inward positive) is
// Φ(d/σ) − Φ((d − w)/σ), the exact 1-D band profile, and the stack stops eroding at w/2 (nothing is left beyond it).
export function shadowStack({ paths, sigma, dx = 0, dy = 0, opacity, colour = "#000", K = 24, idPrefix, fillRule = "nonzero", maskRegion = { x: -100, y: -100, width: 300, height: 300 }, extra = "", bandWidth = Infinity }) {
  const inner = Math.min(2.5 * sigma, bandWidth / 2);
  const E = []; for (let i = 0; i < K; i++) E.push(2.5 * sigma - (2.5 * sigma + inner) * i / (K - 1));
  const profile = (e) => Phi(-e / sigma) - (isFinite(bandWidth) ? Phi((-e - bandWidth) / sigma) : 0);
  const ps = paths.map((d) => `<path d="${d}"/>`).join("");
  const layers = [], masks = []; let prod = 1;
  for (let i = 0; i < K; i++) {
    const e = E[i]; const mid = i + 1 < K ? (E[i] + E[i + 1]) / 2 : E[i] - 0.5 * sigma;
    const target = opacity * profile(mid); const o = Math.max(0, 1 - (1 - target) / prod); prod *= (1 - o);
    if (o < 0.00005) continue;
    if (e >= 0) layers.push(`<g opacity="${o.toFixed(4)}" fill="${colour}" stroke="${colour}" stroke-width="${(2 * e).toFixed(4)}" stroke-linejoin="round" stroke-linecap="round" fill-rule="${fillRule}"${extra}>${ps}</g>`);
    else { const id = `${idPrefix}-erode-${i}`; masks.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="${maskRegion.x}" y="${maskRegion.y}" width="${maskRegion.width}" height="${maskRegion.height}"><g fill="#fff" fill-rule="${fillRule}">${ps}</g><g fill="none" stroke="#000" stroke-width="${(2 * -e).toFixed(4)}" stroke-linejoin="round" stroke-linecap="round">${ps}</g></mask>`); layers.push(`<g opacity="${o.toFixed(4)}" fill="${colour}" fill-rule="${fillRule}" mask="url(#${id})"${extra}>${ps}</g>`); }
  }
  const body = (dx || dy) ? `<g transform="translate(${dx} ${dy})">${layers.join("")}</g>` : layers.join("");
  return { defs: masks.join(""), body, cumulative: 1 - prod, layers: layers.length };
}
