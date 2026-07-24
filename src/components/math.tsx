import katex from "katex";

export function InlineMath({ children }: { children: string }) {
  return (
    <span
      className="math-inline"
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(children, {
          throwOnError: false,
          strict: false,
        }),
      }}
    />
  );
}

export function BlockMath({
  children,
  label,
}: {
  children: string;
  label?: string;
}) {
  return (
    <div className="math-block" aria-label={label}>
      <div
        dangerouslySetInnerHTML={{
          __html: katex.renderToString(children, {
            displayMode: true,
            throwOnError: false,
            strict: false,
          }),
        }}
      />
    </div>
  );
}
