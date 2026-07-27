import type { Language } from "../lib/types";

export function HeroVisual({ language = "en" }: { language?: Language }) {
  const english = language === "en";
  return (
    <div
      className="hero-visual"
      aria-label={
        english
          ? "Three locally invertible sheets mapping to one target"
          : "三个局部可逆薄片映到同一目标的示意图"
      }
    >
      <svg viewBox="0 0 620 420" role="img">
        <defs>
          <pattern id="micro-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeWidth=".55" />
          </pattern>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <rect className="visual-grid" x="1" y="1" width="618" height="418" rx="2" fill="url(#micro-grid)" />
        <text className="visual-eyebrow" x="35" y="40">SOURCE · ℂ³</text>
        <text className="visual-eyebrow" x="483" y="40">TARGET · ℂ³</text>
        <g className="sheet sheet-a">
          <path d="M55 100 C126 68 195 73 265 108 C306 129 337 148 371 170" />
          <path d="M53 115 C128 83 194 89 259 120" opacity=".32" />
          <circle cx="96" cy="91" r="6" />
        </g>
        <g className="sheet sheet-b">
          <path d="M57 207 C132 175 197 183 265 211 C307 228 340 229 371 220" />
          <path d="M55 222 C126 193 194 199 260 224" opacity=".32" />
          <circle cx="130" cy="181" r="6" />
        </g>
        <g className="sheet sheet-c">
          <path d="M56 322 C126 286 195 295 263 318 C309 334 340 306 371 270" />
          <path d="M54 337 C127 304 192 309 257 331" opacity=".32" />
          <circle cx="94" cy="303" r="6" />
        </g>
        <g className="mapping-lines">
          <path d="M382 171 C425 185 447 199 484 215" markerEnd="url(#arrow)" />
          <path d="M382 220 C429 220 449 220 484 220" markerEnd="url(#arrow)" />
          <path d="M382 270 C425 251 448 237 484 225" markerEnd="url(#arrow)" />
        </g>
        <g className="target">
          <circle cx="522" cy="220" r="48" />
          <circle cx="522" cy="220" r="8" />
          <circle cx="522" cy="220" r="3" />
        </g>
        <g className="moving-points">
          <circle cx="0" cy="0" r="4">
            <animateMotion dur="4.8s" repeatCount="indefinite" path="M96 91 C190 78 282 125 522 220" />
          </circle>
          <circle cx="0" cy="0" r="4">
            <animateMotion dur="4.8s" begin=".5s" repeatCount="indefinite" path="M130 181 C245 207 350 220 522 220" />
          </circle>
          <circle cx="0" cy="0" r="4">
            <animateMotion dur="4.8s" begin="1s" repeatCount="indefinite" path="M94 303 C224 319 342 281 522 220" />
          </circle>
        </g>
        <text className="visual-label" x="34" y="382">
          {english ? "LOCAL · EACH SHEET INVERTIBLE" : "局部：每一薄片可逆"}
        </text>
        <text className="visual-label visual-label-right" x="586" y="382">
          {english ? "GLOBAL · THREE POINTS, ONE IMAGE" : "全局：三点同像"}
        </text>
      </svg>
      <div className="visual-legend">
        <span>
          <i className="legend-line" />{" "}
          {english ? "nonzero constant Jacobian" : "非零常雅可比"}
        </span>
        <span>
          <i className="legend-point" />{" "}
          {english ? "collision fiber" : "碰撞纤维"}
        </span>
      </div>
    </div>
  );
}
