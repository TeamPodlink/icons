import { A, DocsPage, P, Section } from "@/components/docs";
import { useTitle } from "@/lib/use-title";

const REPO_URL = "https://github.com/TeamPodlink/icons";

export function LegalDocs() {
  useTitle("Legal · refraction");
  return (
    <DocsPage
      title="Legal"
      intro="Please read this before using any artwork from this collection."
    >
      <Section title="Trademarks and copyrights">
        <P>
          The code in this project is MIT-licensed.{" "}
          <strong>The icon artwork is not ours</strong> — every icon, badge
          mark, and logo remains the property of its platform&apos;s owner,
          including any trademark and copyright it carries. Artwork is
          reproduced here for identification purposes only, as podcast
          directories have always done with app badges. Inclusion in this
          collection does not imply any affiliation with or endorsement by
          the trademark holder.
        </P>
      </Section>

      <Section title="Using an icon">
        <P>
          Each icon includes a link to its respective product. Permission
          must be obtained from the platform before using its logo — this
          collection grants no rights to the artwork, and we cannot grant
          any on a brand&apos;s behalf. You are responsible for verifying
          that your use complies with the owner&apos;s current terms.
        </P>
      </Section>

      <Section title="Brand guidelines">
        <P>
          Where a platform publishes brand guidelines, we record the link in
          its metadata and surface it in the directory and API. That data is
          incomplete: a missing link does not mean no guidelines exist.
          Check the platform&apos;s own site before shipping its mark.
        </P>
      </Section>

      <Section title="What we accept">
        <P>
          Only official, current icons sourced from the platform&apos;s own
          shipped artwork are accepted — no fan redesigns, no mockups, no
          recreations. This is the same artwork policy that governs
          contributions; see{" "}
          <A href={`${REPO_URL}/blob/main/CONTRIBUTING.md`}>
            CONTRIBUTING.md
          </A>
          .
        </P>
      </Section>

      <Section title="Removal requests">
        <P>
          If you own an icon shown here and want it updated or removed,{" "}
          <A href={`${REPO_URL}/issues/new`}>open an issue on GitHub</A>{" "}
          stating your affiliation with the brand. Removal requests are
          honored promptly.
        </P>
      </Section>
    </DocsPage>
  );
}
