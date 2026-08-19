import { A, Code, DocsPage, P, Section } from "@/components/docs";
import { useTitle } from "@/lib/use-title";

const REPO_URL = "https://github.com/TeamPodlink/icons";

export function GuideDocs() {
  useTitle("Guide · refraction");
  return (
    <DocsPage
      title="Guide"
      intro="How to browse, download, and hotlink the collection. Every podcast platform's icon, served three ways."
    >
      <Section title="The three facets">
        <P>
          The sidebar's top section switches the directory between the three
          facets, each with its own artwork and delivery path:
        </P>
        <Code>{`Liquid Glass  /         ground-truth renders of real .icon bundles by
                        Apple's own Icon Composer renderer, light +
                        dark renditions — served as rasters
Vector        /vector   flat 32×32 vector squircles — served as SVG
Badge         /badges   "Listen on …" badges, light + dark — served
                        as SVG`}</Code>
        <P>
          Liquid Glass icons are continuous fields — refraction, speculars,
          measured lighting — which no small vector can carry, so that facet
          ships exact rendered pixels. The flat vector and badge facets are
          plain SVG.
        </P>
      </Section>

      <Section title="Browse and search">
        <P>
          Search matches platform names, ids, and aliases (fuzzy). Sort
          cycles Latest (first-addition date), A-Z, and Popular (OP3
          download-share order). Both persist in the URL as{" "}
          <code>?search</code> and <code>?sort</code>, so filtered views are
          shareable links.
        </P>
      </Section>

      <Section title="Per-icon downloads">
        <P>
          Right-click any card for its actions: Liquid Glass cards copy or
          download the 1024px PNG (plus the dark rendition where one
          exists) and copy the embed HTML; vector and badge cards copy or
          download the SVG. Badge actions target the rendition currently
          displayed — light or dark follows your theme. Clicking a card
          opens its detail view, where the same actions appear as buttons.
        </P>
      </Section>

      <Section title="Dark renditions">
        <P>
          A Liquid Glass bundle that declares (or receives) a distinct dark
          rendition ships it as a parallel <code>-dark</code> asset set; the
          site swaps renditions with your color scheme. Bundles whose artwork
          is natively dark render identically in both schemes and ship a
          single set. Badges always come as a light/dark pair.
        </P>
      </Section>

      <Section title="Hotlinking">
        <P>
          The fastest correct embed is <strong>Copy embed HTML</strong> —
          right-click a Liquid Glass card (or use the button on its detail
          page) and paste. You get a complete <code>&lt;picture&gt;</code>{" "}
          element: AVIF with a WebP fallback, 1x/2x renditions for a 64px
          icon, the dark rendition wired to{" "}
          <code>prefers-color-scheme</code> when one exists, and a
          lazy-loading <code>&lt;img&gt;</code> fallback. For example:
        </P>
        <Code>{`<picture>
  <source media="(prefers-color-scheme: dark)" type="image/avif"
          srcset=".../overcast-dark-64.avif 1x, .../overcast-dark-128.avif 2x">
  <source media="(prefers-color-scheme: dark)" type="image/webp"
          srcset=".../overcast-dark-64.webp 1x, .../overcast-dark-128.webp 2x">
  <source type="image/avif" srcset=".../overcast-64.avif 1x, .../overcast-128.avif 2x">
  <source type="image/webp" srcset=".../overcast-64.webp 1x, .../overcast-128.webp 2x">
  <img src=".../overcast-64.webp" alt="Overcast app icon"
       width="64" height="64" loading="lazy">
</picture>`}</Code>
        <P>
          Assets are served from an immutable release prefix on the asset
          CDN — files under a published release never change, so hotlinking
          is safe and cache-friendly. A 32px-CSS icon costs ~2 KB as AVIF.
        </P>
        <P>URL anatomy, if you'd rather assemble your own:</P>
        <Code>{`https://assets.icons.podlink.com/<release>/<slug>[-dark]-<size>.avif|.webp
https://assets.icons.podlink.com/<release>/<slug>.png   ← 1024px PNG

<release> e.g. 0.2.0 · <slug> platform id, e.g. overcast
<size> 32 | 64 | 128 | 256 | 512 · -dark where a dark rendition exists`}</Code>
      </Section>

      <Section title="Bulk download">
        <P>
          Each asset release is also attached to the corresponding{" "}
          <A href={`${REPO_URL}/releases`}>GitHub Release</A> as{" "}
          <code>assets-&lt;release&gt;.zip</code> — every raster plus the
          release manifest, for offline or build-time use.
        </P>
        <P>
          For the flat vectors and badges as a package, see{" "}
          <A href="/docs/packages">Packages</A>.
        </P>
      </Section>
    </DocsPage>
  );
}
