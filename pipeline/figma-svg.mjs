// Import SVGs as editable vectors, retaining SVG masks as native Figma masks.
// OpenPencil's standard SVG importer handles paths, gradients and clip paths;
// masks and filter effects need explicit scene nodes.
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { parseColor, initCanvasKit } from "@open-pencil/core";
import { outlineSVGStrokes } from "./outline-svg-strokes.mjs";

const elements = (node) => Array.from(node.childNodes).filter((n) => n.nodeType === 1);
const ref = (value) => /^url\(#(.+)\)$/.exec(value ?? "")?.[1];
const serializer = new XMLSerializer();
const xml = (node) => serializer.serializeToString(node);

export async function importIconSVG(figma, source, report) {
  source = outlineSVGStrokes(source, await initCanvasKit(), report);
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = doc.documentElement;
  const byId = new Map(Array.from(root.getElementsByTagName("*")).filter((e) => e.hasAttribute("id")).map((e) => [e.getAttribute("id"), e]));
  const defs = `<defs>${Array.from(byId.values()).filter((e) => ["linearGradient", "radialGradient", "clipPath", "mask", "filter", "path", "g"].includes(e.localName)).map(xml).join("")}</defs>`;
  const viewBox = root.getAttribute("viewBox") || "0 0 32 32";
  const frame = (name) => {
    const node = figma.createFrame();
    node.name = name; node.resize(32, 32); node.fills = []; node.clipsContent = false;
    return node;
  };
  const markup = (node, ancestors) => {
    let content = node.cloneNode(true);
    content.removeAttribute("mask"); content.removeAttribute("filter");
    for (const ancestor of ancestors.toReversed()) {
      const wrapper = ancestor.cloneNode(false);
      wrapper.removeAttribute("mask"); wrapper.removeAttribute("filter");
      wrapper.appendChild(content); content = wrapper;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="32" height="32" viewBox="${viewBox}" fill="${root.getAttribute("fill") || "black"}">${defs}${xml(content)}</svg>`;
  };
  const importLeaf = (element, ancestors) => {
    const imported = figma.createNodeFromSvg(markup(element, ancestors));
    // The importer adds a white fill to its viewport frame. SVG viewports
    // are transparent, including those used for an alpha/luminance mask.
    imported.fills = [];
    imported.clipsContent = false;
    return imported;
  };
  const needsTraversal = (element) => element.hasAttribute("mask") || element.hasAttribute("filter") ||
    Array.from(element.getElementsByTagName("*")).some((e) => e.hasAttribute("mask") || e.hasAttribute("filter"));
  const scaleOf = (ancestors) => {
    let scale = 1;
    for (const el of ancestors) for (const m of (el.getAttribute("transform") || "").matchAll(/(scale|matrix)\(([^)]+)\)/g)) {
      const n = m[2].trim().split(/[ ,]+/).map(Number);
      scale *= m[1] === "scale" ? Math.abs(n[0]) : Math.hypot(n[0], n[1]);
    }
    return scale;
  };
  const applyFilter = (node, filter, ancestors) => {
    const ops = elements(filter), tags = ops.map((e) => e.localName);
    const scale = scaleOf(ancestors);
    const number = (e, attr, fallback = 0) => Number(e?.getAttribute(attr) || fallback);
    const blur = ops.find((e) => e.localName === "feGaussianBlur");
    const offset = ops.find((e) => e.localName === "feOffset");
    const flood = ops.find((e) => e.localName === "feFlood");
    const simpleShadow = tags.join() === "feGaussianBlur,feOffset,feFlood,feComposite";
    const simpleBlur = tags.every((t) => ["feGaussianBlur", "feOffset", "feFlood", "feBlend"].includes(t));
    if (simpleShadow || simpleBlur) {
      if (simpleShadow) {
        const color = (flood.getAttribute("flood-color") || "#000").toLowerCase();
        const parsed = parseColor(color);
        if (!parsed) throw new Error(`Unsupported shadow color ${color}`);
        for (const child of node.findAll((n) => n.type === "VECTOR")) {
          child.fills = [{ type: "SOLID", color: parsed }];
        }
        node.opacity = number(flood, "flood-opacity", 1);
      }
      if (blur) node.effects = [{ type: "LAYER_BLUR", radius: number(blur, "stdDeviation") * 2 * scale, visible: true }];
      node.x += number(offset, "dx") * scale;
      node.y += number(offset, "dy") * scale;
    } else {
      // Figma effects approximate SVG filter chains without rasterizing paths.
      const shadows = [];
      let dx = 0, dy = 0, radius = 0;
      for (const op of ops) {
        if (op.localName === "feOffset") { dx = number(op, "dx"); dy = number(op, "dy"); }
        if (op.localName === "feGaussianBlur") radius = number(op, "stdDeviation") * 2;
        if (op.localName === "feColorMatrix") {
          const values = (op.getAttribute("values") || "").trim().split(/\s+/).map(Number);
          if (values.length === 20 && values[18] >= 0 && values[18] <= 1 && radius) {
            shadows.push({ type: "DROP_SHADOW", radius: radius * scale, offset: { x: dx * scale, y: dy * scale },
              color: { r: values[4], g: values[9], b: values[14], a: values[18] }, visible: true, blendMode: "NORMAL" });
          }
        }
      }
      // SVG inner-shadow chains flood the inverse alpha, blur/offset it,
      // then clip it back into SourceAlpha (Queue's highlight and shade).
      for (let i = 0; i < ops.length; i++) {
        if (ops[i].localName !== "feFlood") continue;
        const next = ops.findIndex((op, index) => index > i && op.localName === "feFlood");
        const chain = ops.slice(i, next < 0 ? ops.length : next);
        if (!chain.some((op) => op.localName === "feComposite" && op.getAttribute("operator") === "out") ||
            !chain.some((op) => op.localName === "feComposite" && op.getAttribute("operator") === "in")) continue;
        const color = parseColor(ops[i].getAttribute("flood-color") || "#000");
        const innerBlur = chain.find((op) => op.localName === "feGaussianBlur");
        const innerOffset = chain.find((op) => op.localName === "feOffset");
        shadows.push({ type: "INNER_SHADOW", radius: number(innerBlur, "stdDeviation") * 2 * scale,
          offset: { x: number(innerOffset, "dx") * scale, y: number(innerOffset, "dy") * scale },
          color: { ...color, a: number(ops[i], "flood-opacity", 1) }, visible: true, blendMode: "NORMAL" });
      }
      if (shadows.length) node.effects = shadows;
      report.filterApproximations.push(filter.getAttribute("id"));
    }
    report.filters++;
  };
  const visit = (element, ancestors) => {
    if (["defs", "mask", "filter", "clipPath", "title", "desc", "metadata"].includes(element.localName)) return null;
    let node;
    if (["g", "svg"].includes(element.localName) && needsTraversal(element)) {
      node = frame("Group");
      for (const child of elements(element)) {
        const imported = visit(child, [...ancestors, element]);
        if (imported) node.appendChild(imported);
      }
    } else node = importLeaf(element, ancestors);
    const mask = byId.get(ref(element.getAttribute("mask")));
    if (mask) {
      if (mask.getAttribute("maskUnits") !== "userSpaceOnUse") throw new Error("Unsupported SVG mask coordinates");
      const group = frame("Masked artwork");
      const content = doc.createElementNS(root.namespaceURI, "g");
      for (const child of elements(mask)) content.appendChild(child.cloneNode(true));
      const maskNode = importLeaf(content, [...ancestors, element.cloneNode(false)]);
      maskNode.name = "Mask"; maskNode.isMask = true;
      maskNode.maskType = /mask-type\s*:\s*alpha/.test(mask.getAttribute("style") || "") ? "ALPHA" : "LUMINANCE";
      group.appendChild(maskNode); group.appendChild(node); node = group;
      report.masks++;
    }
    const filter = byId.get(ref(element.getAttribute("filter")));
    if (filter) applyFilter(node, filter, [...ancestors, element]);
    return node;
  };
  const artwork = frame("Artwork");
  for (const child of elements(root)) {
    const imported = visit(child, []);
    if (imported) artwork.appendChild(imported);
  }
  return artwork;
}
