import { Code, DocsPage, P, Section } from "@/components/docs";
import { useTitle } from "@/lib/use-title";

export function ApiDocs() {
  useTitle("API · refraction");
  return (
    <DocsPage
      title="JSON API"
      intro="Metadata and asset URLs for every platform and facet, for tooling and non-React consumers. Static JSON files generated at build time — no server. For React apps, prefer the shadcn registry (Liquid Glass) or @podlink/icons (flat + badges)."
    >
      <Section title="Endpoints">
        <Code>{`GET /api/platforms.json          all platforms
GET /api/platforms/{id}.json     one platform`}</Code>
        <P>
          These are plain static files: there are no query parameters. Fetch
          the full list once and filter client-side — it is small, immutable
          per deploy, and cache-friendly.
        </P>
        <P>
          Each entry includes the flat icon URL, badge URLs (light/dark), and
          every Liquid Glass bundle with light (and, where distinct, dark)
          asset URLs at 32-512px AVIF+WebP + 1024px PNG, its registry item URL,
          and the shadcn install command. Liquid Glass images are served from
          the versioned CDN prefix{" "}
          <code className="font-mono">
            https://assets.icons.podlink.com/&#123;version&#125;/
          </code>
          ; flat icons and badges from{" "}
          <code className="font-mono">/flat/&#123;id&#125;.svg</code> and{" "}
          <code className="font-mono">/badges/&#123;id&#125;-light|dark.svg</code>{" "}
          on this site.
        </P>
      </Section>

      <Section title="Procedural recipes (research)">
        <P>
          Some bundles additionally exist as calibrated procedural recipes —
          data modules (5–12&nbsp;KB each) rendered by a shared ~26&nbsp;KB
          engine, no rasters involved, within 2.2–7.6 visible-RGB RMSE of
          Apple&apos;s renderer at 1024px and indistinguishable from the exact
          renders at display sizes. They power the &quot;live&quot; toggle on the
          directory cards. This is the research layer, not the recommended
          delivery path — the raster components are smaller and exact.
        </P>
        <Code>{`import { createLiquidRenderer } from "refraction-engine/engine";
import { recipe } from "refraction-engine/recipes/overcast";

const r = createLiquidRenderer(recipe);
const src = await r.dataUri({ size: 256 }); // PNG data URI`}</Code>
      </Section>
    </DocsPage>
  );
}
