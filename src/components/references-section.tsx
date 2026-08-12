"use client";

import { BookOpen, ExternalLink, FileText, Globe2 } from "lucide-react";
import type { ConjectureData, Language } from "../lib/types";

const TYPE_LABELS = {
  paper: { en: "Paper", zh: "论文" },
  book: { en: "Book", zh: "专著" },
  website: { en: "Website", zh: "专题网站" },
  dataset: { en: "Data & tools", zh: "数据与工具" },
};

export function ReferencesSection({
  conjecture,
  language,
}: {
  conjecture: ConjectureData;
  language: Language;
}) {
  const english = language === "en";
  return (
    <section className="references-section section-shell" id="references">
      <div className="section-lead references-lead">
        <span className="section-index">06 / REFERENCES</span>
        <h2>{english ? `Sources and related work for the ${conjecture.title}` : `${conjecture.titleZh}的资料与相关工作`}</h2>
        <p>
          {english
            ? "The benchmark is built on a much larger mathematical record. We thank the authors, editors, maintainers, and institutions who made these works and specialist resources available."
            : "本评测建立在更广泛的数学积累之上。感谢这些文献与专题资源的作者、编辑、维护者和机构。"}
        </p>
      </div>
      <div className="reference-grid">
        {conjecture.references.map((reference, index) => {
          const Icon = reference.type === "website"
            ? Globe2
            : reference.type === "paper"
              ? FileText
              : BookOpen;
          return (
            <a href={reference.url} target="_blank" rel="noreferrer" className="reference-card" key={`${reference.url}-${index}`}>
              <div className="reference-card-top">
                <span><Icon size={16} /> {english ? TYPE_LABELS[reference.type].en : TYPE_LABELS[reference.type].zh}</span>
                <ExternalLink size={16} />
              </div>
              <h3>{english ? reference.title : reference.titleZh}</h3>
              {(reference.authors || reference.year || reference.venue) ? (
                <p className="reference-meta">
                  {[reference.authors, reference.venue, reference.year].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <p>{english ? reference.description : reference.descriptionZh}</p>
            </a>
          );
        })}
      </div>
      <p className="reference-maintenance-note">
        {english
          ? `This list is maintained in conjectures/${conjecture.id}.json so future conjectures can carry their own sources.`
          : `本列表维护于 conjectures/${conjecture.id}.json；未来新增猜想可直接携带自己的参考资料。`}
      </p>
    </section>
  );
}
