import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fitCircleSafeArea, inkRadius, validateSafeArea } from "./circle-safe-area.mjs";
import { syncCircleSafeArea } from "./circle-layout.mjs";

test("radial measurement distinguishes a circular glyph from bounding-box corners", () => {
  const circle = new Uint8Array(101 * 101);
  for (let y = 0; y < 101; y++) for (let x = 0; x < 101; x++)
    if (Math.hypot(x - 50, y - 50) <= 40) circle[y * 101 + x] = 255;
  const box = new Uint8Array(circle.length);
  for (let y = 10; y <= 90; y++) for (let x = 10; x <= 90; x++) box[y * 101 + x] = 255;
  assert.ok(inkRadius(circle, 101, 101, 101, 101, 1, [0, 0]) < 41);
  assert.ok(inkRadius(box, 101, 101, 101, 101, 1, [0, 0]) > 57);
});

test("fits the selected foreground, preserves plate, and never enlarges artwork", async () => {
  const dir = mkdtempSync(join(tmpdir(), "circle-fit-test-"));
  try {
    mkdirSync(join(dir, "Assets"));
    writeFileSync(join(dir, "Assets/mark.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="3" y="3" width="26" height="26"/></svg>');
    const plate = { name: "plate", "image-name": "unmeasured.svg", position: { scale: 32 } };
    const mark = { name: "mark", "image-name": "mark.svg", position: { scale: 32, "translation-in-points": [24, 0] } };
    const doc = { groups: [{ layers: [plate, mark] }] };
    const originalPlate = structuredClone(plate);
    const config = { inset: 0.1, layers: ["mark"] };
    const fit = await fitCircleSafeArea(doc, dir, config);
    assert.ok(fit.scale < 1);
    assert.equal(mark.position["translation-in-points"][0], 24 * fit.scale);
    assert.deepEqual(plate, originalPlate);
    writeFileSync(join(dir, "circle-layout.json"), JSON.stringify({ safeArea: config }));
    writeFileSync(join(dir, "icon.json"), JSON.stringify(doc));
    await syncCircleSafeArea(dir);
    const saved = readFileSync(join(dir, "icon.json"), "utf8");
    const savedLayer = JSON.parse(saved).groups[0].layers[1];
    assert.equal(savedLayer.position, undefined);
    assert.equal(savedLayer["position-specializations"][1].idiom, "watchOS");
    await syncCircleSafeArea(dir);
    assert.equal(readFileSync(join(dir, "icon.json"), "utf8"), saved);
    const measured = await fitCircleSafeArea(doc, dir, config);
    assert.ok(measured.radius <= 409.6 + 1e-6);
    mark.position.scale = 1;
    mark.position["translation-in-points"] = [0, 0];
    assert.equal((await fitCircleSafeArea(doc, dir, config)).scale, 1);
    await assert.rejects(fitCircleSafeArea(doc, dir, { ...config, layers: ["missing"] }), /Expected one/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("rejects invalid insets and ambiguous layer lists", () => {
  for (const inset of [0, 0.5, -0.1, NaN]) assert.throws(() => validateSafeArea({ inset, layers: ["mark"] }));
  assert.throws(() => validateSafeArea({ inset: 0.1, layers: ["mark", "mark"] }));
});

test("one policy synchronizes native and Vector safe areas without shrinking the plate", async () => {
  const dir = mkdtempSync(join(tmpdir(), "circle-vector-fit-test-"));
  const bundle = join(dir, "Fixture.icon");
  try {
    mkdirSync(join(bundle, "Assets"), { recursive: true });
    writeFileSync(join(bundle, "Assets/mark.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M2 2h28v28H2z"/></svg>');
    writeFileSync(join(bundle, "icon.json"), JSON.stringify({ groups: [{ layers: [{ name: "mark", "image-name": "mark.svg", position: { scale: 32 } }] }] }));
    writeFileSync(join(bundle, "circle-layout.json"), JSON.stringify({ safeArea: { inset: 0.1, layers: ["mark"] }, vector: { group: "safe" } }));
    writeFileSync(join(dir, "icon-circle.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path id="plate" d="M0 0h32v32H0z"/><g id="safe" transform="scale(.94)"><path d="M2 2h28v28H2z"/></g></svg>');
    const fit = await syncCircleSafeArea(bundle);
    const saved = readFileSync(join(dir, "icon-circle.svg"), "utf8");
    assert.ok(saved.includes(`scale(${fit.scale})`));
    assert.ok(saved.includes('<path id="plate" d="M0 0h32v32H0z"/>'));
    const native = JSON.parse(readFileSync(join(bundle, "icon.json"), "utf8")).groups[0].layers[0];
    assert.equal(native["position-specializations"].find((s) => s.idiom === "watchOS").value.scale, 32 * fit.scale);
    await syncCircleSafeArea(bundle);
    assert.equal(readFileSync(join(dir, "icon-circle.svg"), "utf8"), saved);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
