import { A, Code, DocsPage, P, Section } from "@/components/docs";
import { useTitle } from "@/lib/use-title";

export function PackagesDocs() {
  useTitle("Packages · refraction");
  return (
    <DocsPage
      title="Packages"
      intro="One npm package: @podlink/icons — the flat vector squircles and the light/dark badges, as React components, framework-agnostic SVG data, and static SVG files."
    >
      <Section title="Install">
        <Code>{`npm i @podlink/icons`}</Code>
        <P>
          MIT-licensed code, zero runtime dependencies; React is an optional
          peer dependency (only the <code>/react</code> entry needs it).
        </P>
      </Section>

      <Section title="React components">
        <Code>{`import { PlatformIcon, PlatformBadge } from "@podlink/icons/react";

<PlatformIcon platform="overcast" size={32} />
<PlatformIcon platform="pocketcasts" shape="circle" />
<PlatformBadge platform="applepodcasts" theme="dark" height={40} />`}</Code>
        <P>
          <code>PlatformIcon</code> renders the flat vector clipped to a{" "}
          <code>shape</code> — <code>superellipse</code> (default),{" "}
          <code>circle</code>, or <code>square</code>.{" "}
          <code>PlatformBadge</code> renders the &ldquo;Listen on …&rdquo;
          badge (<code>theme</code>, <code>label</code>, <code>dir</code>,{" "}
          <code>height</code> props). Both accept any platform id or alias
          and render nothing for unknown platforms.
        </P>
      </Section>

      <Section title="Framework-agnostic core">
        <Code>{`import { getIconData, getPlatform, resolvePlatformId } from "@podlink/icons";

const data = getIconData("overcast"); // { viewBox, content } SVG strings
const p = getPlatform("pocket casts"); // aliases resolve too`}</Code>
        <P>
          The core entry exposes the platform list, alias resolution, and raw
          SVG data for building your own markup in any framework.
        </P>
      </Section>

      <Section title="Static SVGs">
        <Code>{`@podlink/icons/static/icons/<id>.svg          flat squircle
@podlink/icons/static/badges/<id>-light.svg   badge, light
@podlink/icons/static/badges/<id>-dark.svg    badge, dark`}</Code>
        <P>
          Plain files for pipelines that want assets, not components (badge
          text is pre-converted to paths — no font dependency).
        </P>
      </Section>

      <Section title="What is not in npm">
        <P>
          Liquid Glass rasters are not packaged: they are per-release pixel
          sets, downloaded per icon from the directory or hotlinked from the
          immutable CDN prefix — see the <A href="/docs/guide">Guide</A>.
        </P>
      </Section>
    </DocsPage>
  );
}
