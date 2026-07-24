import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jacobian Frontier · 雅可比反例评测",
  description:
    "面向雅可比反例构造的五级数学评测、确定性验证、模型推理轨迹与交互式符号工作台。",
  keywords: ["Jacobian", "counterexample", "benchmark", "symbolic verification"],
  openGraph: {
    title: "Jacobian Frontier",
    description: "反例构造，不止答案：构造、证书、验证与可复现轨迹。",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
