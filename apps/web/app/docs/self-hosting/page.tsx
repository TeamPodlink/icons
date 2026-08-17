import { Code, DocsPage, P, Section } from "@/components/docs";

export const metadata = { title: "Self-hosting · refraction" };

export default function SelfHostingDocs() {
  return (
    <DocsPage
      title="Self-hosting the images"
      intro="Installed components default to the public jsDelivr CDN, which is fine for prototypes. For production, serve the images from your own origin: same availability as your app, no third-party requests, immutable caching under your control."
    >
      <Section title="Next.js on Vercel (e.g. pod.link)">
        <P>1. Install the versioned asset package:</P>
        <Code>{`npm install @podlink/refraction`}</Code>
        <P>
          2. Copy the assets into <code className="font-mono">public/</code> as
          part of your build (works locally and on Vercel):
        </P>
        <Code>{`// package.json
{
  "scripts": {
    "prebuild": "cp -R node_modules/@podlink/refraction/assets public/refraction"
  }
}`}</Code>
        <P>
          3. Point the installed component at your copy — edit one line in{" "}
          <code className="font-mono">
            components/liquidglass/liquid-glass-icon.tsx
          </code>
          :
        </P>
        <Code>{`const ASSET_BASE = "/refraction";`}</Code>
        <P>
          4. (Optional) Add immutable cache headers in{" "}
          <code className="font-mono">vercel.json</code> — safe because
          upgrading the npm package re-copies new files on the next deploy:
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

      <Section title="Any other stack">
        <P>
          The asset package is just a folder of files — copy{" "}
          <code className="font-mono">
            node_modules/@podlink/refraction/assets
          </code>{" "}
          to wherever your app serves static files and set{" "}
          <code className="font-mono">ASSET_BASE</code> accordingly. Naming:{" "}
          <code className="font-mono">
            &lt;slug&gt;[-dark][-32|-64|-128|-256|-512].(avif|webp)
          </code>{" "}
          plus a 1024px <code className="font-mono">&lt;slug&gt;.png</code>{" "}
          master. <code className="font-mono">manifest.json</code> lists every
          bundle and whether it has a dark rendition.
        </P>
      </Section>

      <Section title="Why not next/image?">
        <P>
          The assets are already sized (32-512) and compressed; a plain{" "}
          <code className="font-mono">&lt;picture&gt;</code> with srcset serves
          the exact bytes with no optimizer in the path, and works identically
          outside Next.js.
        </P>
      </Section>
    </DocsPage>
  );
}
