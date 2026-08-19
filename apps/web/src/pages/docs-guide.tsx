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
          Every card carries copy and download actions for the facet on
          screen: Liquid Glass cards copy or download the 1024px PNG; vector
          and badge cards copy or download the SVG. Badge actions target the
          rendition currently displayed — light or dark follows your theme.
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
          Liquid Glass rasters are served from an immutable release prefix on
          the asset CDN — files under a published release never change, so
          hotlinking is safe and cache-friendly. The URL pattern:
        </P>
        <Code>{`https://assets.icons.podlink.com/<release>/<slug>.png            1024px PNG
https://assets.icons.podlink.com/<release>/<slug>-<size>.avif    sized raster
https://assets.icons.podlink.com/<release>/<slug>-dark-<size>.avif

<release>   the asset release, e.g. 0.2.0 (new renders publish
            under a new release; old prefixes stay up)
<slug>      the bundle slug — the platform id, e.g. overcast
<size>      32 | 64 | 128 | 256 | 512 (.webp also available;
            omit the size for the 1024px .png)
-dark       the dark rendition, where one exists`}</Code>
        <P>
          A 32px-CSS icon costs ~2 KB as AVIF. Use the sized AVIF/WebP
          renditions for pages and the 1024px PNG for design tools.
        </P>
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
