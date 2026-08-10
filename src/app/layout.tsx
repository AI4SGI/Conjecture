import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "OPBench · OpenProblemBench",
  description:
    "A verifiable benchmark and public research interface for AI attempts on open mathematical problems.",
  keywords: ["OPBench", "open problems", "conjecture", "benchmark", "symbolic verification"],
  openGraph: {
    title: "OPBench · OpenProblemBench",
    description: "Open-problem evaluation, deterministic verification, reproducible model traces, and public discussion.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
