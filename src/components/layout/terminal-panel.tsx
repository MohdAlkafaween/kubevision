"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Plus, X, Play } from "lucide-react";

interface TerminalTab {
  id: string;
  label: string;
  history: Array<{ command: string; output: string; success: boolean; timestamp: string }>;
  input: string;
  running: boolean;
}

let nextTabId = 1;
function createTab(cluster: string | null, isInitial?: boolean): TerminalTab {
  const n = isInitial ? 1 : ++nextTabId;
  return {
    id: isInitial ? "tab-initial" : `tab-${nextTabId}`,
    label: cluster ? `${cluster}` : `Terminal ${n}`,
    history: [],
    input: "",
    running: false,
  };
}

interface TerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  cluster: string | null;
  height: number;
  onHeightChange: (h: number) => void;
}

export function TerminalPanel({ isOpen, onClose, cluster, height, onHeightChange }: TerminalPanelProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [createTab(cluster, true)]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [activeTab?.history.length]);

  const updateTab = useCallback((id: string, updates: Partial<TerminalTab>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const executeCommand = useCallback(
    async (tabId: string, command: string) => {
      if (!command.trim()) return;
      updateTab(tabId, { running: true });

      try {
        const res = await fetch("/api/exec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: command.trim(), context: cluster }),
        });
        const data = await res.json();

        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  running: false,
                  input: "",
                  history: [
                    ...t.history,
                    {
                      command: command.trim(),
                      output: data.stdout || data.stderr || "",
                      success: data.success,
                      timestamp: new Date().toLocaleTimeString(),
                    },
                  ],
                }
              : t
          )
        );
      } catch {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  running: false,
                  input: "",
                  history: [
                    ...t.history,
                    {
                      command: command.trim(),
                      output: "Failed to execute command",
                      success: false,
                      timestamp: new Date().toLocaleTimeString(),
                    },
                  ],
                }
              : t
          )
        );
      }
    },
    [cluster, updateTab]
  );

  const addTab = () => {
    const tab = createTab(cluster);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        onClose();
        return prev;
      }
      if (activeTabId === id) {
        const idx = prev.findIndex((t) => t.id === id);
        const newActive = next[Math.min(idx, next.length - 1)];
        setActiveTabId(newActive.id);
      }
      return next;
    });
  };

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: height };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      const newH = Math.max(120, Math.min(dragRef.current.startH + delta, window.innerHeight * 0.7));
      onHeightChange(newH);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className="flex-shrink-0 bg-[var(--terminal-bg)] border-t border-border flex flex-col"
      style={{ height: isOpen ? height : 0, overflow: isOpen ? undefined : "hidden" }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        className="h-1 bg-border hover:bg-neon-cyan/40 cursor-ns-resize transition-colors shrink-0"
      />

      {/* Tab bar */}
      <div className="flex items-center bg-[var(--terminal-header)] border-b border-border shrink-0">
        <div className="flex-1 flex items-center overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`group flex items-center gap-1.5 px-3 py-1.5 text-[10px] cursor-pointer border-r border-border transition-colors min-w-0 ${
                tab.id === activeTabId
                  ? "bg-[var(--terminal-bg)] text-neon-cyan"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <div className="flex gap-1 shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-neon-green/70" />
              </div>
              <span className="truncate max-w-[100px]">{tab.label}</span>
              {tab.running && (
                <div className="w-1.5 h-1.5 rounded-full bg-neon-amber animate-pulse shrink-0" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-neon-red transition-all shrink-0 ml-auto"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addTab}
          className="px-2 py-1.5 text-muted-foreground hover:text-neon-cyan transition-colors shrink-0 border-l border-border"
          title="New terminal tab"
        >
          <Plus className="w-3 h-3" />
        </button>
        <button
          onClick={onClose}
          className="px-2 py-1.5 text-muted-foreground hover:text-neon-red transition-colors shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Terminal content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 text-xs">
        {activeTab.history.length === 0 && (
          <div className="text-muted-foreground">
            <p>Welcome to KubeVision Terminal</p>
            <p className="text-neon-green/60 mt-1">
              Type kubectl commands below. Context: {cluster || "none"}
            </p>
          </div>
        )}
        {activeTab.history.map((entry, i) => (
          <div key={i} className="mb-3">
            <div className="flex items-center gap-1 text-neon-cyan">
              <span className="text-muted-foreground text-[10px]">[{entry.timestamp}]</span>
              <span className="text-neon-green">$</span>
              <span>{entry.command}</span>
            </div>
            <pre
              className={`mt-1 whitespace-pre-wrap text-[11px] leading-relaxed ${
                entry.success ? "text-foreground/80" : "text-neon-red"
              }`}
            >
              {entry.output}
            </pre>
          </div>
        ))}
        {activeTab.running && (
          <div className="flex items-center gap-2 text-neon-amber">
            <div className="w-1.5 h-1.5 rounded-full bg-neon-amber animate-pulse" />
            <span>Running...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center border-t border-border px-3 py-2 gap-2 shrink-0">
        <span className="text-neon-green text-xs">$</span>
        <input
          type="text"
          value={activeTab.input}
          onChange={(e) => updateTab(activeTab.id, { input: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !activeTab.running) executeCommand(activeTab.id, activeTab.input);
          }}
          placeholder="kubectl get pods..."
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          disabled={activeTab.running}
        />
        <button
          onClick={() => executeCommand(activeTab.id, activeTab.input)}
          disabled={activeTab.running || !activeTab.input.trim()}
          className="text-muted-foreground hover:text-neon-green disabled:opacity-30 transition-colors"
        >
          <Play className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
