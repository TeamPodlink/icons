import { Code, DocsPage, P, Section } from "@/components/docs";
import { useTitle } from "@/lib/use-title";

export function RegistryDocs() {
  useTitle("Registry · refraction");
  return (
    <DocsPage
      title="shadcn registry"
      intro="Liquid Glass icons install as code into your project — a small typed component per icon, plus one shared base component. No package dependency, no lock-in: after installing, the code is yours to edit."
    >
      <Section title="Setup">
        <P>
          Add the registry to your <code className="font-mono">components.json</code>:
        </P>
        <Code>{`{
  "registries": {
    "@refraction": "https://icons.podlink.com/r/{name}.json"
  }
}`}</Code>
      </Section>

      <Section title="Install icons">
        <Code>{`npx shadcn@latest add @refraction/overcast
npx shadcn@latest add @refraction/apple @refraction/spotify
npx shadcn@latest add @refraction/all-icons   # everything`}</Code>
        <P>
          Each command drops{" "}
          <code className="font-mono">
            components/liquidglass/&lt;slug&gt;-icon.tsx
          </code>{" "}
          into your project (and the shared{" "}
          <code className="font-mono">liquid-glass-icon.tsx</code> base the
          first time). Icon slugs are platform ids; an alternate icon would
          append its variant (<code className="font-mono">-dark</code>,{" "}
          <code className="font-mono">-pride</code>).
        </P>
      </Section>

      <Section title="Use">
        <Code>{`import { OvercastIcon } from "@/components/liquidglass/overcast-icon";

<OvercastIcon size={32} />

// class-based dark mode (Tailwind "dark" class):
<OvercastIcon size={32} theme="class" />`}</Code>
        <P>
          The component renders a <code className="font-mono">&lt;picture&gt;</code>{" "}
          with a 1x/2x srcset (AVIF-primary, WebP fallback). Icons with a
          distinct dark rendition switch automatically — via{" "}
          <code className="font-mono">prefers-color-scheme</code> by default
          (zero JS), or via Tailwind&apos;s <code className="font-mono">dark</code>{" "}
          class with <code className="font-mono">theme=&quot;class&quot;</code> if
          your site has a theme toggle.
        </P>
      </Section>

      <Section title="Flat icons & badges">
        <P>
          Flat vector icons and &quot;Listen on&quot; badges ship separately as{" "}
          <code className="font-mono">@podlink/icons</code> — SVG strings +
          React components for every platform:
        </P>
        <Code>{`npm install @podlink/icons

import { PlatformIcon, PlatformBadge } from "@podlink/icons/react";

<PlatformIcon platform="overcast" size={24} />
<PlatformBadge platform="overcast" />`}</Code>
      </Section>

      <Section title="Where images come from">
        <P>
          Installed Liquid Glass components point at{" "}
          <code className="font-mono">
            https://assets.icons.podlink.com/&#123;version&#125;/
          </code>{" "}
          — an immutable, versioned release prefix on Cloudflare R2 — so they
          work with zero configuration, and upgrading is an explicit component
          re-install, never a silent asset change. For production we recommend
          self-hosting the images — see the self-hosting guide; it&apos;s one
          zip download and a one-line change.
        </P>
      </Section>
    </DocsPage>
  );
}
