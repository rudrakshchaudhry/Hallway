// Hallway's app mark, rendered to PNG by next/og for the apple and PWA icons.
export function BrandMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0d1117",
        color: "#3fb950",
        fontSize: Math.round(size * 0.66),
        fontWeight: 700,
      }}
    >
      H
    </div>
  );
}
