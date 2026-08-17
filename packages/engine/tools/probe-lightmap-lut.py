# Probe: do baked lightmaps reduce to a function of glass-silhouette
# geometry — luma ~ LUT(signed edge distance, edge-normal angle)?
# Feasibility gate for a universal glass-lighting model (the body-light
# LUT trick, applied to glass layers).
#
# Per glass icon: rasterize the glass silhouette union at lightmap
# resolution, chamfer signed EDT + normal angle, bin lightmap luma into a
# (distance x angle) LUT; report per-icon R^2 (does the model form explain
# the field near edges), the energy fraction living near edges, and
# cross-icon LUT correlation (does it transfer across geometries).
#
#   $PYTHON packages/engine/tools/probe-lightmap-lut.py
#
# Pure numpy + PIL; no ictool needed (reads adopted recipes).

import base64
import json
import os
import re
import zlib

import numpy as np
from PIL import Image

HERE = os.path.dirname(__file__)
RECIPES = os.path.join(HERE, "..", "recipes")
OUT = "/tmp/probe-lightmap-lut"
os.makedirs(OUT, exist_ok=True)

SLUGS = ["apple", "overcast", "overcast-premiumblue", "podcastrepublic"]

# distance bins in 1024-canvas px (negative = outside the silhouette)
DBINS = np.arange(-16, 52, 4)
NPHI = 16


def load_recipe(slug):
    src = open(os.path.join(RECIPES, f"{slug}.mjs")).read()
    m = re.search(r"export const recipe = (\{.*\});", src, re.S)
    return json.loads(m.group(1))


def lm_field(recipe):
    lm = recipe["lm"]
    raw = zlib.decompress(base64.b64decode(lm["y"]))
    f = (np.frombuffer(raw, np.uint8).astype(np.float64) - 128) * lm["q"]
    return f.reshape(lm["h"], lm["w"]), lm["ds"]


def rasterize(segs_list, size, scale):
    # even-odd scanline fill of flattened cubics (union across paths by
    # rasterizing each path and OR-ing)
    mask = np.zeros((size, size), bool)
    for seg in segs_list:
        pts = []
        for s in range(0, len(seg), 8):
            p = np.array(seg[s : s + 8]).reshape(4, 2) / scale
            t = np.linspace(0, 1, 17)[1:]
            mt = 1 - t
            xy = (
                np.outer(mt**3, p[0])
                + np.outer(3 * mt**2 * t, p[1])
                + np.outer(3 * mt * t**2, p[2])
                + np.outer(t**3, p[3])
            )
            pts.append(np.vstack([p[0], xy]))
        poly = np.vstack(pts)
        x1, y1 = poly[:-1, 0], poly[:-1, 1]
        x2, y2 = poly[1:, 0], poly[1:, 1]
        keep = y1 != y2
        x1, y1, x2, y2 = x1[keep], y1[keep], x2[keep], y2[keep]
        m = np.zeros((size, size), bool)
        for row in range(size):
            yy = row + 0.5
            hit = (y1 <= yy) != (y2 <= yy)
            if not hit.any():
                continue
            xs = np.sort(x1[hit] + (yy - y1[hit]) * (x2[hit] - x1[hit]) / (y2[hit] - y1[hit]))
            for a, b in zip(xs[0::2], xs[1::2]):
                m[row, max(int(np.ceil(a - 0.5)), 0) : min(int(np.floor(b + 0.5)), size)] = True
        mask |= m
    return mask


def chamfer_sdf(mask):
    # signed distance (grid px, + inside), 3-4 chamfer / sqrt(2)-ish
    big = 1e6
    d_in = np.where(mask, big, 0.0)
    d_out = np.where(mask, 0.0, big)

    def sweep(d):
        h, w = d.shape
        for y in range(h):
            for x in range(w):
                v = d[y, x]
                if y > 0:
                    v = min(v, d[y - 1, x] + 1)
                    if x > 0:
                        v = min(v, d[y - 1, x - 1] + 1.4)
                    if x < w - 1:
                        v = min(v, d[y - 1, x + 1] + 1.4)
                if x > 0:
                    v = min(v, d[y, x - 1] + 1)
                d[y, x] = v
        for y in range(h - 1, -1, -1):
            for x in range(w - 1, -1, -1):
                v = d[y, x]
                if y < h - 1:
                    v = min(v, d[y + 1, x] + 1)
                    if x > 0:
                        v = min(v, d[y + 1, x - 1] + 1.4)
                    if x < w - 1:
                        v = min(v, d[y + 1, x + 1] + 1.4)
                if x < w - 1:
                    v = min(v, d[y, x + 1] + 1)
                d[y, x] = v
        return d

    return sweep(d_in) - sweep(d_out)


def boxblur(a, r):
    for ax in (0, 1):
        c = np.cumsum(np.pad(a, [(r + 1, r) if k == ax else (0, 0) for k in (0, 1)], mode="edge"), axis=ax)
        a = (c[2 * r + 1 :, :] - c[: -2 * r - 1, :]) / (2 * r + 1) if ax == 0 else (c[:, 2 * r + 1 :] - c[:, : -2 * r - 1]) / (2 * r + 1)
    return a


results = {}
for slug in SLUGS:
    r = load_recipe(slug)
    lm, ds = lm_field(r)
    size = lm.shape[0]
    scale = 1024 / size
    mask = rasterize([g["path"] for g in r["glass"]], size, scale)
    sdf = chamfer_sdf(mask) * scale  # canvas px, + inside
    sm = boxblur(sdf.copy(), 2)
    gy, gx = np.gradient(sm)
    phi = np.arctan2(gy, gx)  # normal direction of increasing inside-ness

    band = (sdf >= DBINS[0]) & (sdf < DBINS[-1])
    di = np.clip(np.digitize(sdf, DBINS) - 1, 0, len(DBINS) - 2)
    pi = ((phi + np.pi) / (2 * np.pi) * NPHI).astype(int) % NPHI

    lut = np.zeros((len(DBINS) - 1, NPHI))
    cnt = np.zeros_like(lut)
    np.add.at(lut, (di[band], pi[band]), lm[band])
    np.add.at(cnt, (di[band], pi[band]), 1)
    lutm = np.where(cnt > 0, lut / np.maximum(cnt, 1), 0.0)

    pred = lutm[di, pi] * band
    resid = (lm - pred) * band
    tot = float((lm[band] ** 2).sum())
    r2 = 1 - float((resid[band] ** 2).sum()) / max(tot, 1e-9)
    band_energy = tot / max(float((lm**2).sum()), 1e-9)
    results[slug] = {"lut": lutm, "cnt": cnt, "r2": r2, "band_energy": band_energy}
    print(f"{slug:22s} band-energy {band_energy:5.1%}   R2(d,phi) {r2:5.2f}")

    vis = lutm - lutm.min()
    vis = (vis / max(vis.max(), 1e-9) * 255).astype(np.uint8)
    Image.fromarray(vis).resize((NPHI * 16, (len(DBINS) - 1) * 16), Image.NEAREST).save(
        os.path.join(OUT, f"{slug}-lut.png")
    )

print("\ncross-icon LUT correlation (bins with >=8 samples in both):")
names = list(results)
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        a, b = results[names[i]], results[names[j]]
        m = (a["cnt"] >= 8) & (b["cnt"] >= 8)
        va, vb = a["lut"][m], b["lut"][m]
        c = float(np.corrcoef(va, vb)[0, 1]) if m.sum() > 4 else float("nan")
        print(f"  {names[i]:22s} vs {names[j]:22s} r={c:6.3f}  ({int(m.sum())} bins)")
print(f"\nLUT images -> {OUT}")
