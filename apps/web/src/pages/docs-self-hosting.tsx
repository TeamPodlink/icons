import { Code, DocsPage, P, Section } from "@/components/docs";
import { useTitle } from "@/lib/use-title";

export function SelfHostingDocs() {
  useTitle("Self-hosting · refraction");
  return (
    <DocsPage
      title="Self-hosting the images"
      intro="Installed components default to assets.icons.podlink.com — an immutable, versioned CDN prefix — which is fine for most sites. For production you can serve the images from your own origin: same availability as your app, no third-party requests, caching entirely under your control."
    >
      <Section title="1. Download the release archive">
        <P>
          Every release attaches{" "}
          <code className="font-mono">assets-&lt;version&gt;.zip</code> to the{" "}
          <a
            className="underline decoration-neutral-400 underline-offset-2"
            href="https://github.com/TeamPodlink/icons/releases"
            target="_blank"
            rel="noreferrer"
          >
            GitHub Release
          </a>{" "}
          — a flat folder of every icon file plus{" "}
          <code className="font-mono">manifest.json</code>. Pick the version
          your installed component pins in its{" "}
          <code className="font-mono">ASSET_BASE</code> URL.
        </P>
      </Section>

      <Section title="2. Serve it from your app">
        <P>
          Extract into a versioned static directory (any stack — it&apos;s
          just files):
        </P>
        <Code>{`unzip assets-0.2.0.zip -d public/refraction/0.2.0`}</Code>
        <P>
          3. Point the installed component at your copy — edit one line in{" "}
          <code className="font-mono">
            components/liquidglass/liquid-glass-icon.tsx
          </code>
          :
        </P>
        <Code>{`const ASSET_BASE = "/refraction/0.2.0";`}</Code>
      </Section>

      <Section title="3. (Optional) immutable cache headers">
        <P>
          Because the directory is versioned, immutable caching is safe — a
          future upgrade extracts a new version directory and changes{" "}
          <code className="font-mono">ASSET_BASE</code>, so stale caches can
          never pin old pixels. E.g. in{" "}
          <code className="font-mono">vercel.json</code>:
        </P>
        <Code>{`{
  "headers": [
    {
      "source": "/refraction/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}`}</Code>
      </Section>

      <Section title="File naming">
        <P>
          The archive is a flat folder:{" "}
          <code className="font-mono">
            &lt;slug&gt;[-dark][-32|-64|-128|-256|-512].(avif|webp)
          </code>{" "}
          plus a 1024px <code className="font-mono">&lt;slug&gt;.png</code>{" "}
          master. <code className="font-mono">manifest.json</code> lists every
          bundle and whether it has a dark rendition.
        </P>
      </Section>

      <Section title="Why a plain <picture>?">
        <P>
          The assets are already sized (32-512) and compressed; a plain{" "}
          <code className="font-mono">&lt;picture&gt;</code> with srcset serves
          the exact bytes with no optimizer in the path, and works identically
          in any framework.
        </P>
      </Section>
    </DocsPage>
  );
}
