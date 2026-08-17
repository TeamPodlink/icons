import type { Metadata } from "next";
import { Code, DocsPage, P, Section } from "@/components/docs";
import { SpecFieldTable } from "@/components/spec-field-table";
import survey from "@/lib/icon-spec-survey.json";

export const metadata: Metadata = {
  title: "The .icon format — refraction",
  description:
    "Empirical documentation of Apple's Liquid Glass .icon bundle format, surveyed from first-party and catalog icons.",
};

export default function IconFormatPage() {
  const { firstParty, catalog } = survey.sources;
  return (
    <DocsPage
      title="The .icon format"
      intro={`Apple's Liquid Glass icon source format, documented empirically from ${firstParty} first-party icons extracted from Apple's own apps plus the ${catalog} bundles in this catalog. Apple publishes no spec; everything here is observed.`}
    >
      <Section title="Bundle anatomy">
        <P>
          An <code>.icon</code> bundle is a directory authored by Icon Composer
          and compiled by <code>actool</code> into an{" "}
          <code>IconImageStack</code> inside an app&apos;s{" "}
          <code>Assets.car</code>. It has exactly two parts: a{" "}
          <code>icon.json</code> document and an <code>Assets/</code> folder of
          layer artwork (SVG or PNG).
        </P>
        <Code>{`MyApp.icon/
  icon.json          the document below
  Assets/
    glyph.svg        vector layer art (or .png raster art)
    …`}</Code>
        <P>
          The document is a canvas <em>fill</em> plus a z-ordered list of{" "}
          <em>groups</em>, each holding z-ordered <em>layers</em> that
          reference artwork in <code>Assets/</code> by file name. Observed
          bounds: 1–4 groups (compiled icons with more exist — iCloud — but{" "}
          <code>actool</code> refuses to validate them) and 1–19 layers per
          document.
        </P>
      </Section>

      <Section title="Colors and fills">
        <P>
          Colors are strings of the form{" "}
          <code>&lt;colorspace&gt;:&lt;components&gt;</code> with three
          observed colorspaces: <code>srgb:R,G,B,A</code>,{" "}
          <code>display-p3:R,G,B,A</code>, and <code>gray:W,A</code>,
          components in 0–1. A fill is one of three shapes:
        </P>
        <Code>{`"fill": { "solid": "srgb:1.00000,1.00000,1.00000,1.00000" }

"fill": {
  "linear-gradient": ["gray:0.19200,1.00000", "gray:0.07800,1.00000"],
  "orientation": { "start": { "x": 0.5, "y": 0 }, "stop": { "x": 0.5, "y": 1 } }
}

"fill": { "automatic-gradient": "display-p3:0.74400,0.29700,0.00000,1.00000" }`}</Code>
        <P>
          Every observed gradient is vertical — <code>orientation</code>{" "}
          x-coordinates are 0.5 in all {firstParty + catalog} surveyed icons,
          with start.y ∈ [0, 1] and stop.y ∈ [0.3, 1].{" "}
          <code>automatic-gradient</code> takes a single color and derives a
          gradient by rules Apple does not document; this project measures the
          derived result from renders rather than guessing it. Note that
          declared Display-P3 fills pass through a gamut mapping that is not
          colorimetric clipping — the rendered sRGB pixel is not what naive
          conversion predicts.
        </P>
      </Section>

      <Section title="The specialization pattern">
        <P>
          Any styling property can carry per-appearance overrides via a
          sibling key named <code>&lt;property&gt;-specializations</code>: an
          array of <code>{`{ appearance, value }`}</code> entries. Exactly two
          appearances are observed: <code>dark</code> and <code>tinted</code>{" "}
          (light is the unspecialized base). The pattern appears on fills,
          blend modes, opacity, glass, specular, translucency, refractivity,
          blur-material, and lighting.
        </P>
        <Code>{`"fill-specializations": [
  { "appearance": "dark",
    "value": { "linear-gradient": ["gray:0.19200,1.00000", "gray:0.07800,1.00000"],
               "orientation": { "start": { "x": 0.5, "y": 0 },
                                "stop":  { "x": 0.5, "y": 1 } } } }
]`}</Code>
        <P>
          When a document omits dark specializations, the system derives a
          dark rendition automatically: the canvas is darkened and
          light-colored glyphs are tinted toward the former background color.
          Authoring an explicit dark fill is how you opt out of that
          derivation.
        </P>
      </Section>

      <Section title="Group properties">
        <P>
          Groups carry the material treatment. Observed properties and their
          value spaces, most common first:
        </P>
        <Code>{`"blend-mode":    "normal" | "multiply" | "screen" | "plus-lighter" |
                 "plus-darker" | "hard-light" | "lighten" | "overlay"
"lighting":      "individual" | "combined"
"specular":      false | true | "inside" | "outside"
"translucency":  { "enabled": true, "value": 0–1 }
"refractivity":  { "enabled": true, "depth": 0–0.5, "strength": −1–0.86 }
"blur-material": 0.01–1
"shadow":        { "kind": "neutral" | "none", "opacity": 0–1.64 }
"opacity":       0.3–0.97
"hidden":        false`}</Code>
        <P>
          Several of these barely exist outside Apple&apos;s own icons:{" "}
          <code>refractivity</code> appears in 19 of {firstParty} first-party
          icons and 1 of {catalog} catalog icons, <code>blur-material</code>{" "}
          in 27 vs 2, and <code>specular</code>&apos;s{" "}
          <code>&quot;inside&quot;</code>/<code>&quot;outside&quot;</code>{" "}
          enum forms only in first-party documents. Note{" "}
          <code>refractivity.strength</code> can be negative and{" "}
          <code>shadow.opacity</code> exceeds 1 in the wild.
        </P>
      </Section>

      <Section title="Layer properties">
        <P>
          Layers reference artwork and position it. A layer renders at its
          artwork&apos;s natural size (the SVG viewBox, or pixel size — not
          the 1024 canvas) multiplied by <code>position.scale</code>, centered
          on the canvas, then offset by{" "}
          <code>position.translation-in-points</code>.
        </P>
        <Code>{`{ "name": "glyph",
  "image-name": "glyph.svg",
  "position": { "scale": 1.6, "translation-in-points": [0, -12] },
  "fill": { "solid": "srgb:1.00000,1.00000,1.00000,1.00000" },
  "glass": true,
  "opacity": 0.9,
  "blend-mode": "plus-lighter" }`}</Code>
        <P>
          <code>glass</code> marks a layer as Liquid Glass material — it
          refracts what is beneath it, takes the material&apos;s alpha ramp,
          and casts the glass shadow. A layer <code>fill</code> overrides the
          artwork&apos;s own colors with a solid or gradient; observed scale
          spans 0.24–32 and translations −340–512 points.
        </P>
      </Section>

      <Section title="Platforms and features">
        <P>
          <code>supported-platforms</code> declares target shapes:{" "}
          <code>{`{ "squares": "shared" }`}</code> in every surveyed icon,
          plus <code>{`"circles": ["watchOS"]`}</code> in all first-party and
          some catalog documents. First-party documents also carry a{" "}
          <code>features</code> array of capability flags — observed values{" "}
          <code>specular-location</code> and <code>refractivity</code> — in 41
          of {firstParty} first-party icons but almost no third-party ones,
          suggesting it gates newer rendering behavior.
        </P>
      </Section>

      <Section title="Field reference (measured)">
        <P>
          Every key path observed across the {firstParty + catalog} surveyed
          documents — {Object.keys(survey.keys).length} paths — with usage
          counts per corpus, types, and observed values or ranges. Regenerate
          with{" "}
          <code>node pipeline/survey-icon-spec.mjs --corpus &lt;dir&gt;</code>.
        </P>
        <SpecFieldTable />
      </Section>

      <Section title="Authoring traps">
        <P>
          Hard-won rules for hand-editing <code>icon.json</code>, from
          building the {catalog}-bundle catalog:
        </P>
        <Code>{`- ictool rejects invalid documents with one generic error ("The data
  couldn't be read because it is missing"). Bisect your edits.
- Omit "shadow" entirely to express no shadow when hand-authoring;
  ictool has rejected {"kind": "none"} in some contexts even though
  compiled first-party icons contain it.
- Specialized values use [{"value": v}, {"appearance": "dark",
  "value": v2}] — not an object keyed by appearance.
- A glass layer with no effective fill renders with a strong default
  white fill, not as unfilled — never leave fills implicit in
  variant/instrument bundles.
- actool refuses to validate documents with more than 4 groups.`}</Code>
      </Section>

      <Section title="Method">
        <P>
          The first-party corpus was extracted from Apple&apos;s own app
          bundles on macOS with{" "}
          <a
            className="underline decoration-neutral-400 underline-offset-2"
            href="https://github.com/kylebshr/decant"
          >
            decant
          </a>{" "}
          (host-CoreUI extraction; refraction and specular-location details
          may be incomplete on this path), then surveyed as aggregate facts —
          key paths, counts, value spaces. Apple&apos;s artwork is not
          redistributed here: the corpus informs the documentation, and the
          format itself is documented for interoperability. Everything on this
          page is observation, not specification — Apple can change any of it.
        </P>
      </Section>
    </DocsPage>
  );
}
