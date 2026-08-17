import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "refraction · podcast app icons",
  description:
    "Every podcast platform's icon — Liquid Glass renders calibrated against Apple's own renderer, flat vectors, and badges. By Podlink.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} overscroll-none bg-neutral-100 font-sans text-black antialiased dark:bg-neutral-950 dark:text-white`}
      >
        <ThemeProvider attribute="class" disableTransitionOnChange>
          <Toaster position="bottom-right" />
          <Header />
          <Sidebar />
          <main className="overflow-hidden px-2 md:mr-4 md:ml-56 md:px-0">
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
