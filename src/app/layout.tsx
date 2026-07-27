import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conjecture Frontier · Counterexample Benchmark",
  description:
    "A counterexample-construction benchmark for frontier mathematical conjectures, beginning with the Jacobian conjecture.",
  keywords: ["conjecture", "counterexample", "benchmark", "symbolic verification"],
  openGraph: {
    title: "Conjecture Frontier",
    description: "Counterexample construction, deterministic verification, and reproducible model traces.",
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
