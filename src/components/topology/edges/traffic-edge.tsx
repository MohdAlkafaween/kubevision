"use client";

import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export function TrafficEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style = {},
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const traffic = (data as Record<string, unknown>)?.traffic as
    | { requestsPerSec: number; latencyP95: number; errorRate: number }
    | undefined;
  const isActive = traffic && traffic.requestsPerSec > 0;
  const hasErrors = traffic && traffic.errorRate > 0.05;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: hasErrors ? "#FF1744" : isActive ? "#00E5FF" : "#333",
          strokeWidth: isActive ? 2 : 1,
          opacity: isActive ? 0.8 : 0.4,
        }}
      />
      {isActive && (
        <circle r="3" fill={hasErrors ? "#FF1744" : "#00E5FF"}>
          <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
      {traffic && isActive && (
        <text>
          <textPath
            href={`#${id}`}
            startOffset="50%"
            textAnchor="middle"
            className="fill-muted-foreground text-[8px]"
          >
            {traffic.requestsPerSec.toFixed(1)}/s
            {traffic.latencyP95 > 0 && ` · ${traffic.latencyP95.toFixed(0)}ms`}
          </textPath>
        </text>
      )}
    </>
  );
}
