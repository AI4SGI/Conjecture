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
      <ol className="reference-list">
        {conjecture.references.map((reference, index) => {
          const Icon = reference.type === "website"
            ? Globe2
            : reference.type === "paper"
              ? FileText
              : BookOpen;
          return (
            <li className="reference-item" key={`${reference.url}-${index}`}>
              <a href={reference.url} target="_blank" rel="noreferrer">
                <span className="reference-number">{String(index + 1).padStart(2, "0")}</span>
                <div className="reference-primary">
                  <h3>{english ? reference.title : reference.titleZh}</h3>
                  <div className="reference-tags">
                    <span><Icon size={13} /> {english ? TYPE_LABELS[reference.type].en : TYPE_LABELS[reference.type].zh}</span>
                    {reference.year ? <span>{reference.year}</span> : null}
                    {reference.venue ? <span>{reference.venue}</span> : null}
                  </div>
                </div>
                <div className="reference-secondary">
                  {reference.authors ? <b>{reference.authors}</b> : null}
                  <p>{english ? reference.description : reference.descriptionZh}</p>
                </div>
                <ExternalLink className="reference-link-icon" size={17} />
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
