"use client";

import { useState, useEffect } from "react";
import { Shield, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SecurityFinding {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  resource?: string;
  namespace?: string;
  category: string;
}

interface SecurityPosture {
  score: number;
  grade: string;
  findings: SecurityFinding[];
  summary: { critical: number; high: number; medium: number; low: number };
}

interface SecurityPostureProps {
  cluster: string | null;
}

const SEVERITY_CONFIG = {
  critical: { color: "text-neon-red", bg: "bg-neon-red/10", border: "border-neon-red/30", icon: AlertCircle },
  high: { color: "text-neon-amber", bg: "bg-neon-amber/10", border: "border-neon-amber/30", icon: AlertTriangle },
  medium: { color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/30", icon: AlertTriangle },
  low: { color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/30", icon: Info },
};

export function SecurityPosture({ cluster }: SecurityPostureProps) {
  const [posture, setPosture] = useState<SecurityPosture | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);

  useEffect(() => {
    if (!cluster) return;
    setLoading(true);
    fetch(`/api/security/${encodeURIComponent(cluster)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setPosture(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [cluster]);

  if (!cluster) return null;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-6 h-6 text-neon-cyan animate-pulse mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Scanning cluster security...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-neon-red">{error}</p>
      </div>
    );
  }

  if (!posture) return null;

  const gradeColor =
    posture.score >= 90 ? "text-neon-green" :
    posture.score >= 75 ? "text-neon-cyan" :
    posture.score >= 60 ? "text-neon-amber" :
    "text-neon-red";

  const categories = [...new Set(posture.findings.map((f) => f.category))];
  const filtered = filterSeverity
    ? posture.findings.filter((f) => f.severity === filterSeverity)
    : posture.findings;

  const groupedByCategory = categories.reduce((acc, cat) => {
    acc[cat] = filtered.filter((f) => f.category === cat);
    return acc;
  }, {} as Record<string, SecurityFinding[]>);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-4">
          <div className="relative">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
              <circle
                cx="40" cy="40" r="34"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className={gradeColor}
                strokeDasharray={`${(posture.score / 100) * 213.6} 213.6`}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-xl font-bold ${gradeColor}`}>{posture.grade}</span>
              <span className="text-[10px] text-muted-foreground">{posture.score}/100</span>
            </div>
          </div>
          <div className="flex-1 grid grid-cols-4 gap-2">
            {(["critical", "high", "medium", "low"] as const).map((sev) => {
              const cfg = SEVERITY_CONFIG[sev];
              return (
                <button
                  key={sev}
                  onClick={() => setFilterSeverity(filterSeverity === sev ? null : sev)}
                  className={`rounded border px-2 py-1.5 text-center transition-colors ${
                    filterSeverity === sev
                      ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                      : "border-border hover:border-muted-foreground"
                  }`}
                >
                  <div className={`text-lg font-bold ${cfg.color}`}>
                    {posture.summary[sev]}
                  </div>
                  <div className="text-[9px] text-muted-foreground uppercase">{sev}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {categories.map((cat) => {
            const items = groupedByCategory[cat] || [];
            if (items.length === 0) return null;
            const isExpanded = expandedCategory === cat;
            return (
              <div key={cat} className="border border-border rounded overflow-hidden">
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-card/50 transition-colors"
                >
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  <span className="font-medium">{cat}</span>
                  <span className="text-muted-foreground ml-auto">{items.length}</span>
                </button>
                {isExpanded && (
                  <div className="border-t border-border">
                    {items.map((finding) => {
                      const cfg = SEVERITY_CONFIG[finding.severity];
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={finding.id}
                          className="flex items-start gap-2 px-3 py-2 border-b border-border/30 last:border-0"
                        >
                          <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${cfg.color}`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-medium">{finding.title}</div>
                            <div className="text-[10px] text-muted-foreground">{finding.description}</div>
                            {finding.resource && (
                              <div className="text-[9px] text-muted-foreground mt-0.5">
                                {finding.namespace}/{finding.resource}
                              </div>
                            )}
                          </div>
                          <span className={`text-[8px] px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color} shrink-0`}>
                            {finding.severity}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
