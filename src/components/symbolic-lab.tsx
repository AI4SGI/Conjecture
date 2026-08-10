"use client";

import { Code2, ExternalLink, ShieldCheck } from "lucide-react";
import type { ConjectureData, Language } from "../lib/types";
import { NumberTheoryVerifier } from "./number-theory-verifier";
import { PolynomialVerifier } from "./polynomial-verifier";

const REPOSITORY =
  process.env.NEXT_PUBLIC_GITHUB_REPOSITORY ?? "AI4SGI/Conjecture";

export function SymbolicLab({
  conjecture,
  language,
}: {
  conjecture: ConjectureData;
  language: Language;
}) {
  const english = language === "en";
  const verifierUrl = `https://github.com/${REPOSITORY}/blob/main/${conjecture.symbolicLab.verifierPath}`;

  return (
    <section className="verifier section-shell interactive-lab" id="verify">
      <div className="section-lead">
        <span className="section-index">04 / SYMBOLIC LAB</span>
        <h2>
          {english
            ? conjecture.symbolicLab.title
            : conjecture.symbolicLab.titleZh}
        </h2>
        <p>
          {english
            ? conjecture.symbolicLab.body
            : conjecture.symbolicLab.bodyZh}
        </p>
      </div>

      <div className="interactive-scope">
        <div>
          <ShieldCheck size={19} />
          <span>
            <b>
              {english
                ? "Deterministic constraint checks only"
                : "仅做确定性约束检查"}
            </b>
            <small>
              {english
                ? "Inputs stay in the browser. No LLM judge and no novelty judgment."
                : "输入保留在浏览器中；不使用 LLM judge，也不判断创新性。"}
            </small>
          </span>
        </div>
        <span>NO LLM JUDGE</span>
        <span>{english ? "NO NOVELTY JUDGMENT" : "不判断创新性"}</span>
        <a href={verifierUrl} target="_blank" rel="noreferrer">
          <Code2 size={15} />
          {english ? "Offline verifier" : "离线验证器"}
          <ExternalLink size={13} />
        </a>
      </div>

      {conjecture.symbolicLab.interactive === "jacobian" ? (
        <PolynomialVerifier language={language} embedded />
      ) : conjecture.symbolicLab.interactive === "beal" ? (
        <NumberTheoryVerifier kind="beal" language={language} />
      ) : (
        <NumberTheoryVerifier kind="odd-perfect" language={language} />
      )}
    </section>
  );
}
