import { Route, Routes } from "react-router";
import { Toaster } from "sonner";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { IconFormatDocs } from "@/src/pages/docs-icon-format";
import { CategoryPage } from "@/src/pages/directory-category";
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
          <Route path="/" element={<Home />} />
          <Route path="/directory/:category" element={<CategoryPage />} />
          <Route path="/docs/icon-format" element={<IconFormatDocs />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
}
