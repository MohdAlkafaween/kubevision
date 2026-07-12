"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileCode,
  RefreshCw,
  Play,
  Pause,
  Download,
  Trash2,
  HardDrive,
  Save,
  Search,
  ChevronDown,
} from "lucide-react";

interface Pod {
  name: string;
  namespace: string;
  containers?: string[];
}

interface StorageInfo {
  totalBytes: number;
  totalFormatted: string;
  files: { name: string; size: number; modified: string }[];
}

interface LiveLogStreamProps {
  cluster: string | null;
}

export function LiveLogStream({ cluster }: LiveLogStreamProps) {
  const [pods, setPods] = useState<Pod[]>([]);
  const [selectedPod, setSelectedPod] = useState<Pod | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [following, setFollowing] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [search, setSearch] = useState("");
  const [tailLines, setTailLines] = useState(200);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [podSearch, setPodSearch] = useState("");
  const [showPodList, setShowPodList] = useState(true);

  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPods = useCallback(async () => {
    if (!cluster) return;
    try {
      const res = await fetch(`/api/resources/${encodeURIComponent(cluster)}`);
      const data = await res.json();
      const podList = (data.pods || []).map((p: Record<string, unknown>) => ({
        name: p.name as string,
        namespace: p.namespace as string,
        containers: ((p as Record<string, unknown>).status as Record<string, unknown>)?.containerStatuses
          ? (((p as Record<string, unknown>).status as Record<string, unknown>).containerStatuses as Array<{ name: string }>).map((c) => c.name)
          : undefined,
      }));
      setPods(podList);
    } catch {
      setPods([]);
    }
  }, [cluster]);

  const fetchStorage = useCallback(async () => {
    try {
      const res = await fetch("/api/logs/storage");
      const data = await res.json();
      setStorage(data);
    } catch {
      setStorage(null);
    }
  }, []);

  useEffect(() => {
    fetchPods();
    fetchStorage();
  }, [fetchPods, fetchStorage]);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const startFollowing = useCallback(() => {
    if (!selectedPod || !cluster) return;
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    setFollowing(true);
    setLogs([]);

    const containerParam = selectedContainer ? `&container=${encodeURIComponent(selectedContainer)}` : "";
    const url = `/api/logs/stream/${encodeURIComponent(cluster)}?pod=${encodeURIComponent(selectedPod.name)}&namespace=${encodeURIComponent(selectedPod.namespace)}&tail=${tailLines}&follow=true${containerParam}`;

    const eventSource = new EventSource(url);
    eventSource.onmessage = (event) => {
      try {
        const line = JSON.parse(event.data);
        if (line === "[stream closed]") {
          setFollowing(false);
          eventSource.close();
          return;
        }
        const lines = line.split("\n").filter((l: string) => l.length > 0);
        setLogs((prev) => [...prev.slice(-5000), ...lines]);
      } catch {}
    };
    eventSource.onerror = () => {
      setFollowing(false);
      eventSource.close();
    };

    controller.signal.addEventListener("abort", () => {
      eventSource.close();
      setFollowing(false);
    });
  }, [selectedPod, selectedContainer, cluster, tailLines]);

  const stopFollowing = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setFollowing(false);
  }, []);

  const fetchOnce = useCallback(async () => {
    if (!selectedPod || !cluster) return;
    setLogs([]);
    const containerParam = selectedContainer ? `&container=${encodeURIComponent(selectedContainer)}` : "";
    try {
      const res = await fetch(
        `/api/logs/stream/${encodeURIComponent(cluster)}?pod=${encodeURIComponent(selectedPod.name)}&namespace=${encodeURIComponent(selectedPod.namespace)}&tail=${tailLines}&follow=false${containerParam}`
      );
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs.split("\n"));
      }
    } catch {}
  }, [selectedPod, selectedContainer, cluster, tailLines]);

  const handleSelectPod = useCallback((pod: Pod) => {
    stopFollowing();
    setSelectedPod(pod);
    setSelectedContainer(pod.containers?.[0] || "");
    setLogs([]);
  }, [stopFollowing]);

  const handleDownload = useCallback(() => {
    const content = logs.join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedPod?.name || "logs"}-${new Date().toISOString().slice(0, 19)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs, selectedPod]);

  const handleSaveToDisk = useCallback(async () => {
    if (!selectedPod) return;
    const content = logs.join("\n");
    const filename = `${selectedPod.name}-${Date.now()}.log`;
    try {
      await fetch("/api/logs/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, content }),
      });
      fetchStorage();
    } catch {}
  }, [logs, selectedPod, fetchStorage]);

  const handleClearStorage = useCallback(async () => {
    try {
      await fetch("/api/logs/storage", { method: "DELETE" });
      fetchStorage();
    } catch {}
  }, [fetchStorage]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const filteredPods = pods.filter(
    (p) =>
      p.name.toLowerCase().includes(podSearch.toLowerCase()) ||
      p.namespace.toLowerCase().includes(podSearch.toLowerCase())
  );

  const filteredLogs = search
    ? logs.filter((l) => l.toLowerCase().includes(search.toLowerCase()))
    : logs;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-neon-cyan" />
          <span className="text-sm font-medium">Live Log Stream</span>
          {following && (
            <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-neon-green/10 text-neon-green">
              <div className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
              Streaming
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {storage && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <HardDrive className="w-3 h-3" />
              <span>{storage.totalFormatted}</span>
              {storage.totalBytes > 0 && (
                <button
                  onClick={handleClearStorage}
                  className="text-neon-red hover:text-neon-red/80 ml-1"
                  title="Clear saved logs"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {showPodList && (
          <div className="w-56 border-r border-border flex flex-col overflow-hidden">
            <div className="p-2 border-b border-border">
              <input
                type="text"
                placeholder="Filter pods..."
                value={podSearch}
                onChange={(e) => setPodSearch(e.target.value)}
                className="w-full bg-transparent border border-border rounded px-2 py-1 text-[10px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-neon-cyan/50"
              />
            </div>
            <div className="flex-1 overflow-auto">
              {filteredPods.map((pod) => (
                <button
                  key={`${pod.namespace}/${pod.name}`}
                  onClick={() => handleSelectPod(pod)}
                  className={`w-full text-left px-2 py-1.5 text-[10px] transition-colors border-b border-border/30 ${
                    selectedPod?.name === pod.name && selectedPod?.namespace === pod.namespace
                      ? "bg-neon-cyan/10 text-neon-cyan"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/20"
                  }`}
                >
                  <p className="truncate font-medium">{pod.name}</p>
                  <p className="text-[9px] opacity-60">{pod.namespace}</p>
                </button>
              ))}
              {filteredPods.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center py-4">No pods found</p>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selectedPod ? (
            <>
              <div className="px-3 py-2 border-b border-border flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setShowPodList((o) => !o)}
                  className="p-1 rounded hover:bg-accent/30 text-muted-foreground"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showPodList ? "rotate-0" : "-rotate-90"}`} />
                </button>

                <span className="text-[10px] font-medium">{selectedPod.name}</span>

                {selectedPod.containers && selectedPod.containers.length > 1 && (
                  <select
                    value={selectedContainer}
                    onChange={(e) => {
                      stopFollowing();
                      setSelectedContainer(e.target.value);
                    }}
                    className="bg-muted border border-border rounded px-1.5 py-0.5 text-[10px] text-foreground outline-none"
                  >
                    {selectedPod.containers.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}

                <select
                  value={tailLines}
                  onChange={(e) => setTailLines(Number(e.target.value))}
                  className="bg-muted border border-border rounded px-1.5 py-0.5 text-[10px] text-foreground outline-none"
                >
                  <option value={50}>50 lines</option>
                  <option value={100}>100 lines</option>
                  <option value={200}>200 lines</option>
                  <option value={500}>500 lines</option>
                  <option value={1000}>1000 lines</option>
                </select>

                <div className="flex-1" />

                <div className="flex items-center gap-1">
                  <div className="flex items-center border border-border rounded overflow-hidden">
                    <Search className="w-3 h-3 text-muted-foreground ml-1.5" />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="bg-transparent px-1.5 py-0.5 text-[10px] text-foreground placeholder:text-muted-foreground/50 outline-none w-24"
                    />
                  </div>

                  {!following ? (
                    <>
                      <button
                        onClick={fetchOnce}
                        className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground"
                        title="Fetch logs"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={startFollowing}
                        className="p-1 rounded hover:bg-neon-green/10 text-neon-green"
                        title="Start streaming"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={stopFollowing}
                      className="p-1 rounded hover:bg-neon-red/10 text-neon-red"
                      title="Stop streaming"
                    >
                      <Pause className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    onClick={handleDownload}
                    disabled={logs.length === 0}
                    className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    title="Download logs"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={handleSaveToDisk}
                    disabled={logs.length === 0}
                    className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    title="Save to disk"
                  >
                    <Save className="w-3.5 h-3.5" />
                  </button>

                  <label className="flex items-center gap-1 text-[9px] text-muted-foreground ml-1">
                    <input
                      type="checkbox"
                      checked={autoScroll}
                      onChange={(e) => setAutoScroll(e.target.checked)}
                      className="w-3 h-3 rounded"
                    />
                    Auto-scroll
                  </label>
                </div>
              </div>

              <div
                ref={logRef}
                className="flex-1 overflow-auto p-3 font-mono text-[11px] bg-[var(--terminal-bg)]"
              >
                {filteredLogs.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground/50 text-xs">
                    {logs.length === 0
                      ? "Click the play button to start streaming or the refresh button to fetch logs"
                      : "No matching lines"
                    }
                  </div>
                ) : (
                  filteredLogs.map((line, i) => (
                    <div
                      key={i}
                      className="leading-5 hover:bg-accent/10 px-1 -mx-1 rounded whitespace-pre-wrap break-all"
                    >
                      <span className="text-muted-foreground/40 select-none mr-2 inline-block w-8 text-right tabular-nums">
                        {i + 1}
                      </span>
                      <span className={
                        line.includes("error") || line.includes("Error") || line.includes("ERROR")
                          ? "text-neon-red"
                          : line.includes("warn") || line.includes("Warn") || line.includes("WARN")
                          ? "text-neon-amber"
                          : "text-foreground/90"
                      }>
                        {search
                          ? highlightSearch(line, search)
                          : line
                        }
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="px-3 py-1 border-t border-border flex items-center justify-between text-[9px] text-muted-foreground">
                <span>{filteredLogs.length} lines{search && ` (${logs.length} total)`}</span>
                <span>{selectedPod.namespace}/{selectedPod.name}{selectedContainer ? `:${selectedContainer}` : ""}</span>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <FileCode className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-xs text-muted-foreground mb-1">Select a pod to view logs</p>
                <p className="text-[10px] text-muted-foreground/60">Stream logs in real-time or fetch historical logs</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function highlightSearch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-neon-amber/30 text-neon-amber rounded px-0.5">{part}</mark>
    ) : (
      part
    )
  );
}
