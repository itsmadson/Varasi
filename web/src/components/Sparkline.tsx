"use client";

// Minimal inline-SVG sparkline. Points are drawn in insertion order; optional
// onSelect fires with the index of the clicked point.
export function Sparkline({
  points,
  height = 48,
  width = 240,
  onSelect,
}: {
  points: { label: string; value: number }[];
  height?: number;
  width?: number;
  onSelect?: (i: number) => void;
}) {
  if (points.length === 0) {
    return (
      <div className="telemetry text-[10px]" style={{ color: "var(--muted)" }}>
        no history
      </div>
    );
  }
  const max = Math.max(1, ...points.map((p) => p.value));
  const n = points.length;
  const dx = n > 1 ? width / (n - 1) : 0;
  const xy = points.map((p, i) => [i * dx, height - (p.value / max) * (height - 6) - 3] as const);
  const path = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${(n - 1) * dx},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={area} fill="var(--accent)" opacity={0.12} />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
      {xy.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={onSelect ? 3.5 : 2}
          fill="var(--accent)"
          style={{ cursor: onSelect ? "pointer" : "default" }}
          onClick={() => onSelect?.(i)}
        >
          <title>{`${points[i].label}: ${points[i].value.toFixed(2)}`}</title>
        </circle>
      ))}
    </svg>
  );
}
