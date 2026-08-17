import { Code, DocsPage, P, Section } from "@/components/docs";

export const metadata = { title: "API · refraction" };

export default function ApiDocs() {
  return (
    <DocsPage
      title="REST API"
      intro="Metadata and asset URLs for every platform and facet, for tooling and non-React consumers. For React apps, prefer the shadcn registry (Liquid Glass) or @podlink/icons (flat + badges)."
    >
      <Section title="Endpoints">
        <Code>{`GET /api/platforms                     all platforms
GET /api/platforms?search=overcast     filter by name/id
GET /api/platforms?category=podcast-players
GET /api/platforms?facet=liquid-glass  only platforms with glass icons
GET /api/platforms?limit=10
GET /api/platforms/{id}                one platform`}</Code>
        <P>
          Each entry includes the flat icon URL, badge URLs (light/dark), and
          every Liquid Glass bundle with light (and, where distinct, dark)
          asset URLs at 64/128/256px WebP + 1024px PNG, its registry item URL,
          and the shadcn install command. Static files are served at{" "}
          <code className="font-mono">/flat/&#123;id&#125;.svg</code>,{" "}
          <code className="font-mono">/badges/&#123;id&#125;-light|dark.svg</code>, and{" "}
          <code className="font-mono">
            /library/&#123;slug&#125;[-dark][-&#123;size&#125;].webp|.png
          </code>
          .
        </P>
      </Section>

      <Section title="Procedural recipes (research)">
        <P>
          Six bundles additionally exist as calibrated procedural recipes —
          data modules rendered by a shared ~26&nbsp;KB engine, no rasters
          involved, within 1.8–5.1 visible-RGB RMSE of Apple&apos;s renderer at
          1024px. They power the &quot;live&quot; toggle on the directory cards. This is
          the research layer, not the recommended delivery path — the raster
          components are smaller and exact.
        </P>
        <Code>{`import { createLiquidRenderer } from "refraction-engine/engine";
import { recipe } from "refraction-engine/recipes/overcast";

const r = createLiquidRenderer(recipe);
const src = await r.dataUri({ size: 256 }); // PNG data URI`}</Code>
      </Section>
    </DocsPage>
  );
}
