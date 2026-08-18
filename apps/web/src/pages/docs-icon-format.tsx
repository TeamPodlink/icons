import { Code, DocsPage, P, Section } from "@/components/docs";
import { SpecFieldTable } from "@/components/spec-field-table";
import survey from "@/lib/icon-spec-survey.json";
import { useTitle } from "@/lib/use-title";

export function IconFormatDocs() {
  useTitle("The .icon format — refraction");
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
          gradient by rules Apple does not document; the measured derivation
          is in its own section below. Which colorspace conversion a declared
          color actually receives depends on <em>where</em> it is declared —
          the next section gives the measured resolution paths.
        </P>
      </Section>

      <Section title="Color resolution (measured)">
        <P>
          There is no undocumented gamut mapping. The renderer composites in
          sRGB with plain colorimetric clipping, then encodes the result in
          Display-P3 coordinates — rendered output is P3-tagged, but its
          content is sRGB-gamut. Measured across 23 declared colors:
          converting rendered P3 pixels back to sRGB matches naive
          matrix-and-clip conversion to worst-case 3/255. A conforming player
          computes fills as pure math in sRGB. Resolution is not one pipeline
          but four, split by declaration site:
        </P>
        <Code>{`canvas fills       composite in sRGB; display-p3 values gamut-clipped
sRGB layer colors  composite in sRGB — EXCEPT the raw leak below
display-p3 layer   always convert (with a small unexplained deviation
  colors           from the canvas law on gamut-clipped channels)
gradient stops     transformed by the stop law below, then ramped as a
                   plain lerp in encoded sRGB`}</Code>
        <P>
          <strong>The raw leak.</strong> Solid layer colors and fill
          overrides declared in sRGB (hex or <code>srgb:</code>) pass through{" "}
          <em>unconverted</em> — the declared numbers relabeled as P3
          coordinates — when the layer&apos;s artwork has an opaque{" "}
          <em>exact</em> full-bleed background with mean encoded luminance
          below ~0.30 (threshold bracketed to (0.282, 0.314); both{" "}
          <code>&lt;use&gt;</code>-referenced and <code>&lt;path&gt;</code>{" "}
          covers trigger it, coverage one pixel short does not, light
          backgrounds do not). Almost certainly a dark-artwork classifier
          choosing an opaque-blit fast path that skips color conversion. A
          conforming player must reproduce it: the same hex color composites
          in sRGB over a white background and leaks raw over a dark one.
        </P>
        <P>
          <strong>The gradient-stop law.</strong> Gradient stops — hex sRGB
          and <code>color(display-p3 …)</code> declarations produce the
          identical curve — behave as if round-tripped through a working
          space with a different green primary and clipped there: only the
          green channel changes, clamped in linear sRGB to a range set by the
          other two channels,
        </P>
        <Code>{`G' = clamp(G, kR·R + kB·B, span + kR·R + kB·B)
kR = 0.0185   kB = 0.0320   span = 0.9540      (linear light)`}</Code>
        <P>
          measured directly from a 4×4×4 constant-stop sweep (64 renders of
          color→white gradients); fit RMSE 0.18/255 over the grid, and ten
          instrument gradient pairs reproduce at ≤ 1.2 RMSE. The ramp itself
          is a plain lerp of the <em>transformed</em> stops in encoded sRGB —
          a blue→black ramp (both stops zero green) shows the added green
          perfectly linear in t. Skipping the law leaves midtones off by up
          to 45/255 in green while solid fills of the same colors stay exact.
        </P>
      </Section>

      <Section title="The automatic-gradient derivation (measured)">
        <P>
          Measured over a 33-color sweep, <code>automatic-gradient</code>{" "}
          derives a two-stop vertical linear ramp in encoded sRGB
          (mid-ramp deviation &lt; 1 except where channel clipping bends
          it), keyed on the declared color&apos;s lightness: below ~0.775
          the stops are [lightened(input), input] — the declared color sits
          at the bottom, exact; above ~0.775 the ramp flips to [input,
          darkened(input)], anchoring the declared color at the top. The
          lightening is hue-preserving — it rides the dominant channels,
          with a small additive floor near black — and spans 7–18 encoded
          units, jumping in a sawtooth at the 0.25/0.50/0.75 lightness
          quartiles. No closed form is known; the measured gray and hue
          ladders make a table-driven implementation with interpolated
          anchors viable. The derivation composes with the color model
          above exactly once — a player that applies the transfer a second
          time for display-p3-declared inputs renders dark colors near
          black (measured on a navy canvas).
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
          <code>position.translation-in-points</code>. When{" "}
          <code>position</code> is omitted entirely, the default is{" "}
          <em>not</em> fit-to-canvas: the layer renders at scale 1 — one SVG
          unit per canvas unit — centered, and clipped to the canvas
          (measured with a seven-case viewBox sweep; a 1200×500 viewBox
          spills and clips rather than shrinking to fit).
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

      <Section title="The glass material (measured)">
        <P>
          The interior of a glass layer is one universal material family,
          not a per-icon effect. Per-row affine solves over two-gray
          canvases, across translucency {"{0, .25, .5, .75, 1}"} crossed
          with the specular modes, measure it as: a neutral response (chroma
          of the gain term ≤ 0.017), a <em>white</em> overlay (constant term
          ≈ 255·alpha), with alpha varying smoothly in both vertical
          position and translucency — one interpolable 2D family covers
          every material setting. <code>specular</code> has zero measured
          effect on the interior: it is edge lighting only. The vertical
          axis anchors to the <em>glass layer&apos;s bounds</em>, not the
          canvas: alpha is a function of (y − boundsTop) / boundsHeight,
          and the normalized ramp is size-invariant (144px and 336px
          circles fit the same curve; bounds-y fits at the ~1/255 noise
          floor while canvas-y misses by 37–40×). A conforming player
          therefore renders a glass interior as a white overlay whose
          alpha it looks up from the (bounds-normalized y, translucency)
          family, and treats specular purely as an edge-lighting pass;
          edge lighting itself remains unmodeled here.
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
          key paths, counts, value spaces. The rendering laws — color
          resolution, the gradient derivations, placement, the glass
          material — were measured by rendering purpose-built instrument
          bundles through Apple&apos;s own renderer (<code>ictool</code>)
          and fitting the pixels. Apple&apos;s artwork is not
          redistributed here: the corpus informs the documentation, and the
          format itself is documented for interoperability. Everything on this
          page is observation, not specification — Apple can change any of it.
        </P>
      </Section>
    </DocsPage>
  );
}
