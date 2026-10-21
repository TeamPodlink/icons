// Outline in the SVG's own coordinate system before its transforms are applied.
// This retains scaled widths and gradient paints without relying on the .fig
// importer's stroke handling. Source SVGs remain editable in the repository.
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const inherited = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity",
  "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "vector-effect"];
const geometry = new Set(["path", "circle", "ellipse", "rect", "line", "polygon", "polyline"]);
const children = (node) => Array.from(node.childNodes).filter((n) => n.nodeType === 1);

export function outlineSVGStrokes(source, ck, report) {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const refs = new Map(Array.from(doc.getElementsByTagName("*")).filter((e) => e.hasAttribute("id")).map((e) => [e.getAttribute("id"), e]));
  // Resolve use-site presentation before outlining. A stroke can be applied to
  // <use> even when its referenced path has no stroke (Podbean's shading).
  const expandUses = (element, stack = []) => {
    if (element.localName === "use") {
      const href = element.getAttribute("href") || element.getAttribute("xlink:href");
      const target = refs.get(href?.slice(1));
      if (!href?.startsWith("#") || !target || stack.includes(href)) throw new Error(`Invalid SVG use: ${href}`);
      const group = doc.createElementNS(element.namespaceURI, "g");
      for (const attr of Array.from(element.attributes)) if (!["href", "xlink:href", "x", "y", "width", "height"].includes(attr.name)) group.setAttribute(attr.name, attr.value);
      const x = element.getAttribute("x") || "0", y = element.getAttribute("y") || "0";
      group.setAttribute("transform", `${element.getAttribute("transform") || ""} translate(${x} ${y})`);
      const copy = target.cloneNode(true); copy.removeAttribute("id"); group.appendChild(copy);
      element.parentNode.replaceChild(group, element);
      expandUses(copy, [...stack, href]);
    } else for (const child of children(element)) expandUses(child, stack);
  };
  expandUses(doc.documentElement);
  const visit = (element, parent = {}) => {
    const style = Object.fromEntries((element.getAttribute("style") || "").split(";")
      .filter((v) => v.includes(":")).map((v) => v.split(":").map((s) => s.trim())));
    const values = { ...parent };
    for (const key of inherited) {
      const value = style[key] ?? (element.hasAttribute(key) ? element.getAttribute(key) : undefined);
      if (value !== undefined && value !== "inherit") values[key] = value;
    }
    if (!geometry.has(element.localName) || !values.stroke || values.stroke === "none") {
      for (const child of children(element)) visit(child, values);
      return;
    }
    if ((values["stroke-dasharray"] && values["stroke-dasharray"] !== "none") ||
        (values["vector-effect"] && values["vector-effect"] !== "none"))
      throw new Error("Dashed/non-scaling SVG strokes need explicit outlining support");
    let d = element.getAttribute("d");
    if (element.localName === "circle") {
      const cx = Number(element.getAttribute("cx")), cy = Number(element.getAttribute("cy"));
      const r = Number(element.getAttribute("r"));
      d = `M${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy}Z`;
    } else if (element.localName !== "path") {
      throw new Error(`Unsupported stroked SVG geometry: ${element.localName}`);
    }
    const width = Number(values["stroke-width"] ?? 1);
    if (!Number.isFinite(width) || width < 0) throw new Error("Invalid SVG stroke width");
    const path = ck.Path.MakeFromSVGString(d);
    if (!path) throw new Error("Could not parse stroked SVG path");
    const stroked = width ? path.makeStroked({ width, miter_limit: Number(values["stroke-miterlimit"] ?? 4),
      cap: ({ butt: ck.StrokeCap.Butt, round: ck.StrokeCap.Round, square: ck.StrokeCap.Square })[values["stroke-linecap"] ?? "butt"],
      join: ({ miter: ck.StrokeJoin.Miter, round: ck.StrokeJoin.Round, bevel: ck.StrokeJoin.Bevel })[values["stroke-linejoin"] ?? "miter"], precision: 4 }) : null;
    if (width && !stroked) throw new Error("Could not outline SVG stroke");
    const group = doc.createElementNS(element.namespaceURI, "g");
    const fill = element.cloneNode(true);
    // Apply transform, clipping, masks, effects and opacity to the combined
    // fill + outline exactly once. Keep the original id for <use> references.
    for (const key of ["id", "transform", "clip-path", "mask", "filter", "opacity"]) {
      if (element.hasAttribute(key)) group.setAttribute(key, element.getAttribute(key));
      fill.removeAttribute(key);
    }
    if (style.opacity !== undefined) group.setAttribute("opacity", style.opacity);
    fill.removeAttribute("style");
    for (const [key, value] of Object.entries(style)) if (key !== "opacity") fill.setAttribute(key, value);
    fill.setAttribute("stroke", "none");
    fill.setAttribute("fill", values.fill ?? "black");
    // Do not leave an invisible stroke-only centerline behind. Some SVG
    // importers turn a path with neither paint into a default black fill.
    if (values.fill !== "none") group.appendChild(fill);
    if (stroked) {
      const outline = doc.createElementNS(element.namespaceURI, "path");
      outline.setAttribute("d", stroked.toSVGString());
      outline.setAttribute("fill", values.stroke);
      outline.setAttribute("fill-opacity", values["stroke-opacity"] ?? "1");
      outline.setAttribute("fill-rule", "nonzero");
      outline.setAttribute("stroke", "none");
      group.appendChild(outline);
      stroked.delete();
      report.outlinedStrokes = (report.outlinedStrokes ?? 0) + 1;
    }
    path.delete();
    element.parentNode.replaceChild(group, element);
  };
  visit(doc.documentElement);
  return new XMLSerializer().serializeToString(doc);
}
