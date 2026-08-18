import { Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { ApiDocs } from "@/src/pages/docs-api";
import { IconFormatDocs } from "@/src/pages/docs-icon-format";
import { RegistryDocs } from "@/src/pages/docs-registry";
import { SelfHostingDocs } from "@/src/pages/docs-self-hosting";
import { CategoryPage } from "@/src/pages/directory-category";
import { Home } from "@/src/pages/home";
import { LiquidGlassPage } from "@/src/pages/liquid-glass";
import { NotFound } from "@/src/pages/not-found";

export function App() {
  return (
    <>
      <Toaster position="bottom-right" />
      <Header />
      <Sidebar />
      <main className="overflow-hidden px-2 md:mr-4 md:ml-56 md:px-0">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/liquid-glass" element={<LiquidGlassPage />} />
          <Route path="/directory/:category" element={<CategoryPage />} />
          <Route path="/docs/registry" element={<RegistryDocs />} />
          <Route path="/docs/self-hosting" element={<SelfHostingDocs />} />
          <Route path="/docs/api" element={<ApiDocs />} />
          <Route path="/docs/icon-format" element={<IconFormatDocs />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
}
