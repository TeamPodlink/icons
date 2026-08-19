import { Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { CategoryPage } from "@/src/pages/directory-category";
import { ContributingDocs } from "@/src/pages/docs-contributing";
import { GuideDocs } from "@/src/pages/docs-guide";
import { IconDetailPage } from "@/src/pages/icon-detail";
import { LegalDocs } from "@/src/pages/docs-legal";
import { PackagesDocs } from "@/src/pages/docs-packages";
import { ShowcaseDocs } from "@/src/pages/docs-showcase";
import { Home } from "@/src/pages/home";
import { NotFound } from "@/src/pages/not-found";

export function App() {
  return (
    <>
      <Toaster position="bottom-right" />
      <Header />
      <Sidebar />
      <main className="overflow-hidden px-2 md:mr-4 md:ml-56 md:px-0">
        <Routes>
          <Route path="/" element={<Home facet="glass" />} />
          <Route path="/vector" element={<Home facet="flat" />} />
          <Route path="/badges" element={<Home facet="badge" />} />
          <Route path="/icon/:id" element={<IconDetailPage />} />
          <Route path="/directory/:category" element={<CategoryPage />} />
          <Route path="/docs/guide" element={<GuideDocs />} />
          <Route path="/docs/packages" element={<PackagesDocs />} />
          <Route path="/docs/legal" element={<LegalDocs />} />
          <Route path="/docs/contributing" element={<ContributingDocs />} />
          <Route path="/docs/showcase" element={<ShowcaseDocs />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
}
