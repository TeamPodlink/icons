import { A, Code, DocsPage, P, Section } from "@/components/docs";
import { useTitle } from "@/lib/use-title";

const REPO_URL = "https://github.com/TeamPodlink/icons";

export function ContributingDocs() {
  useTitle("Contributing · refraction");
  return (
    <DocsPage
      title="Contributing"
      intro="The collection grows by request and by PR. The one hard rule: artwork comes from official sources, never redrawn by hand."
    >
      <Section title="Request a platform">
        <P>
          Missing a platform? Open a{" "}
          <A href={`${REPO_URL}/issues/new?template=request-icon.yml`}>
            Request an icon
          </A>{" "}
          issue with the platform&apos;s App Store link. Extracting a Liquid
          Glass bundle requires macOS and the installed app, so maintainers
          handle extraction for requests.
        </P>
        <P>
          <strong>App developers:</strong> export the <code>.icon</code> file
          from Icon Composer or your Xcode project and attach it to a{" "}
          <A href={`${REPO_URL}/issues/new?template=submit-icon.yml`}>
            Submit an icon
          </A>{" "}
          issue, or open a PR directly. A developer-submitted bundle is
          authoritative and doubles as permission to include the icon.
        </P>
      </Section>

      <Section title="Artwork policy">
        <P>
          Every icon must come from the platform&apos;s own official artwork:
          the app&apos;s shipped icon bundle, or brand assets the platform
          publishes itself. Only official, current icons are accepted — no
          fan redesigns, no mockups, no tracing or recreating a logo by eye.
          If the artwork didn&apos;t ship from the platform, it doesn&apos;t
          ship here.
        </P>
      </Section>

      <Section title="What a platform PR contains">
        <P>
          One folder per platform, <code>platforms/&lt;id&gt;/</code> (flat
          lowercase id, e.g. <code>pocketcasts</code>):
        </P>
        <Code>{`platforms/overcast/
  meta.json       name, url, added (YYYY-MM-DD), aliases,
                  guidelinesUrl, liquidGlass.bundles[]
  Overcast.icon/  the Liquid Glass bundle (Icon Composer format)
  icon.svg        optional: flat 32×32 vector (viewBox "0 0 32 32")
  badge.svg       optional: badge artwork (badge-dark.svg if it differs)`}</Code>
        <P>
          Register the bundle in <code>meta.json</code> under{" "}
          <code>liquidGlass.bundles</code> (slug = platform id, plus a{" "}
          <code>-variant</code> suffix for alternates), and make sure{" "}
          <code>node pipeline/validate.mjs</code> passes — CI runs the same
          structural checks. Don&apos;t commit rendered images; maintainers
          render and publish assets at release time.
        </P>
      </Section>

      <Section title="The deep version">
        <P>
          Full checklists, release steps, and maintainer tooling live in the
          repo&apos;s{" "}
          <A href={`${REPO_URL}/blob/main/CONTRIBUTING.md`}>
            CONTRIBUTING.md
          </A>
          .
        </P>
      </Section>
    </DocsPage>
  );
}
