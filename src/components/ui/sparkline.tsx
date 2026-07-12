"use client";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function Sparkline({
  data,
  width = 60,
  height = 20,
  color = "var(--neon-cyan, #00e5ff)",
  className,
}: SparklineProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const padding = 1;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const fillPoints = [
    `${padding},${height - padding}`,
    ...points,
    `${width - padding},${height - padding}`,
  ].join(" ");

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
    >
      <polygon
        points={fillPoints}
        fill={color}
        fillOpacity="0.1"
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={points[points.length - 1].split(",")[0]}
        cy={points[points.length - 1].split(",")[1]}
        r="2"
        fill={color}
      />
    </svg>
  );
}

export function formatMetricValue(value: number, type: "cpu" | "memory"): string {
  if (type === "cpu") {
    if (value < 1) return `${Math.round(value * 1000)}μ`;
    if (value < 1000) return `${Math.round(value)}m`;
    return `${(value / 1000).toFixed(1)}`;
  }
  const mb = value / (1024 * 1024);
  if (mb < 1) return `${Math.round(value / 1024)}Ki`;
  if (mb < 1024) return `${Math.round(mb)}Mi`;
  return `${(mb / 1024).toFixed(1)}Gi`;
}
