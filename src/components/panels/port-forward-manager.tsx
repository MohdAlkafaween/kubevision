"use client";

import { useState, useEffect, useCallback } from "react";
import { Play, Square, Globe, Copy, ExternalLink } from "lucide-react";

interface PortForwardSession {
  id: string;
  kind: string;
  name: string;
  namespace: string;
  context: string;
  localPort: number;
  remotePort: number;
  startedAt: string;
  pid?: number;
}

interface PortForwardManagerProps {
  resourceName: string;
  resourceKind: string;
  namespace: string;
  cluster: string;
  ports: number[];
}

export function PortForwardManager({
  resourceName,
  resourceKind,
  namespace,
  cluster,
  ports,
}: PortForwardManagerProps) {
  const [sessions, setSessions] = useState<PortForwardSession[]>([]);
  const [loading, setLoading] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/port-forward");
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const startForward = async (remotePort: number) => {
    setLoading(`start-${remotePort}`);
    try {
      const res = await fetch("/api/port-forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: resourceKind,
          name: resourceName,
          namespace,
          context: cluster,
          remotePort,
        }),
      });
      await res.json();
      await fetchSessions();
    } catch {
      // ignore
    } finally {
      setLoading(null);
    }
  };

  const stopForward = async (id: string) => {
    setLoading(`stop-${id}`);
    try {
      await fetch("/api/port-forward", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await fetchSessions();
    } catch {
      // ignore
    } finally {
      setLoading(null);
    }
  };

  const mySessions = sessions.filter(
    (s) =>
      s.name === resourceName &&
      s.namespace === namespace &&
      s.context === cluster
  );

  const activeRemotePorts = new Set(mySessions.map((s) => s.remotePort));

  if (ports.length === 0) return null;

  return (
    <div className="border border-border rounded p-2 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
        <Globe className="w-3 h-3" />
        Port forwarding
      </div>

      {ports.map((port) => {
        const session = mySessions.find((s) => s.remotePort === port);
        const isActive = activeRemotePorts.has(port);

        return (
          <div
            key={port}
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] border transition-colors ${
              isActive
                ? "bg-neon-green/5 border-neon-green/30"
                : "border-border"
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-neon-green" : "bg-muted-foreground/30"}`} />
            <span className="font-mono">{port}</span>

            {isActive && session && (
              <>
                <span className="text-muted-foreground">→</span>
                <span className="font-mono text-neon-cyan">localhost:{session.localPort}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(`localhost:${session.localPort}`)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Copy address"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <a
                  href={`http://localhost:${session.localPort}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-neon-cyan transition-colors"
                  title="Open in browser"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </>
            )}

            <div className="ml-auto">
              {isActive ? (
                <button
                  onClick={() => session && stopForward(session.id)}
                  disabled={loading === `stop-${session?.id}`}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-neon-red/10 text-neon-red border border-neon-red/30 hover:bg-neon-red/20 transition-colors disabled:opacity-50"
                >
                  <Square className="w-2.5 h-2.5" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => startForward(port)}
                  disabled={loading === `start-${port}`}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-neon-green/10 text-neon-green border border-neon-green/30 hover:bg-neon-green/20 transition-colors disabled:opacity-50"
                >
                  <Play className="w-2.5 h-2.5" />
                  Forward
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
