import type { ConjectureData, Language } from "../lib/types";
import { BlockMath } from "./math";
import { HeroVisual } from "./hero-visual";

export function ConjectureVisual({
  conjecture,
  language,
}: {
  conjecture: ConjectureData;
  language: Language;
}) {
  const english = language === "en";
  if (conjecture.visualization.kind === "jacobian") {
    return (
      <div className="configured-visual">
        <HeroVisual language={language} />
        <div className="visual-example">
          <BlockMath>{conjecture.visualization.example}</BlockMath>
          <p>{english ? conjecture.visualization.caption : conjecture.visualization.captionZh}</p>
        </div>
      </div>
    );
  }

  if (conjecture.visualization.kind === "beal") {
    return (
      <div className="configured-visual arithmetic-visual" aria-label={english ? conjecture.visualization.label : conjecture.visualization.labelZh}>
        <svg viewBox="0 0 620 360" role="img">
          <defs>
            <pattern id="beal-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M24 0H0V24" fill="none" stroke="currentColor" strokeWidth=".55" />
            </pattern>
          </defs>
          <rect className="visual-grid" x="1" y="1" width="618" height="358" fill="url(#beal-grid)" />
          <g className="power-node"><circle cx="120" cy="155" r="70" /><text x="120" y="165">Aˣ</text></g>
          <text className="operator" x="210" y="165">+</text>
          <g className="power-node"><circle cx="300" cy="155" r="70" /><text x="300" y="165">Bʸ</text></g>
          <text className="operator" x="390" y="165">=</text>
          <g className="power-node target-node"><circle cx="500" cy="155" r="70" /><text x="500" y="165">Cᶻ</text></g>
          <path className="factor-link" d="M120 235C215 315 405 315 500 235" />
          <text className="visual-label" x="310" y="326" textAnchor="middle">COMMON PRIME FACTOR?</text>
        </svg>
        <div className="visual-example">
          <BlockMath>{conjecture.visualization.example}</BlockMath>
          <p>{english ? conjecture.visualization.caption : conjecture.visualization.captionZh}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="configured-visual arithmetic-visual" aria-label={english ? conjecture.visualization.label : conjecture.visualization.labelZh}>
      <svg viewBox="0 0 620 360" role="img">
        <defs>
          <pattern id="perfect-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" fill="none" stroke="currentColor" strokeWidth=".55" />
          </pattern>
        </defs>
        <rect className="visual-grid" x="1" y="1" width="618" height="358" fill="url(#perfect-grid)" />
        <circle className="divisor-ring outer" cx="310" cy="175" r="124" />
        <circle className="divisor-ring" cx="310" cy="175" r="76" />
        <circle className="divisor-core" cx="310" cy="175" r="30" />
        <text className="sigma-label" x="310" y="185" textAnchor="middle">N</text>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
          const radians = (angle * Math.PI) / 180;
          return <circle key={angle} className="divisor-point" cx={310 + 124 * Math.cos(radians)} cy={175 + 124 * Math.sin(radians)} r="7" />;
        })}
        <text className="visual-label" x="310" y="330" textAnchor="middle">Σ DIVISORS = 2N</text>
      </svg>
      <div className="visual-example">
        <BlockMath>{conjecture.visualization.example}</BlockMath>
        <p>{english ? conjecture.visualization.caption : conjecture.visualization.captionZh}</p>
      </div>
    </div>
  );
}
