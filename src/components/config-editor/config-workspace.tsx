"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  FileCode,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  AlertCircle,
  Info,
  Lightbulb,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Play,
  Terminal,
  Sparkles,
  LayoutTemplate,
  ListOrdered,
  X,
  Loader2,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { compile, type Diagnostic, type Severity } from "@/lib/config/compiler";
import { CONFIG_TEMPLATES, getTemplatesByCategory, type ConfigTemplate } from "@/lib/config/templates";
import {
  generateApplyCommands,
  generateSequencedCommands,
  generateDryRunCommand,
  generateDiffCommand,
  type GeneratedCommand,
} from "@/lib/config/command-generator";
import { K8S_SCHEMAS } from "@/lib/config/k8s-schemas";

interface ConfigFile {
  id: string;
  name: string;
  namespace: string;
  content: string;
  createdAt: number;
}

interface AiTestResult {
  issues: Array<{ severity: string; title: string; description: string; fix: string }>;
  summary: string;
}

const STORAGE_KEY = "kv-config-files";

function loadFiles(): ConfigFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ConfigFile[];
  } catch {
    return [];
  }
}

function saveFiles(files: ConfigFile[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  } catch {}
}

function severityIcon(s: Severity) {
  switch (s) {
    case "error": return <AlertCircle className="w-3 h-3 text-neon-red flex-shrink-0" />;
    case "warning": return <AlertTriangle className="w-3 h-3 text-neon-amber flex-shrink-0" />;
    case "info": return <Info className="w-3 h-3 text-neon-cyan flex-shrink-0" />;
    case "hint": return <Lightbulb className="w-3 h-3 text-neon-purple flex-shrink-0" />;
  }
}

function severityColor(s: Severity) {
  switch (s) {
    case "error": return "border-neon-red/30 bg-neon-red/5";
    case "warning": return "border-neon-amber/30 bg-neon-amber/5";
    case "info": return "border-neon-cyan/30 bg-neon-cyan/5";
    case "hint": return "border-neon-purple/30 bg-neon-purple/5";
  }
}

export function ConfigWorkspace() {
  const [files, setFiles] = useState<ConfigFile[]>(() => loadFiles());
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [commandMode, setCommandMode] = useState<"apply" | "sequence" | "delete" | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiResult, setAiResult] = useState<AiTestResult | null>(null);
  const [newFileNs, setNewFileNs] = useState("default");
  const [newFileName, setNewFileName] = useState("");
  const [showNewFile, setShowNewFile] = useState(false);
  const [expandedNs, setExpandedNs] = useState<Record<string, boolean>>({ default: true });
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lineNumberRef = useRef<HTMLDivElement>(null);

  const activeFile = useMemo(() => files.find((f) => f.id === activeFileId) || null, [files, activeFileId]);

  const diagnostics = useMemo(() => {
    if (!activeFile) return { valid: true, diagnostics: [], parsed: null, documents: [] };
    return compile(activeFile.content);
  }, [activeFile]);

  const fileStatus = useMemo(() => {
    const map: Record<string, { hasErrors: boolean; hasWarnings: boolean }> = {};
    for (const f of files) {
      if (f.id === activeFileId) {
        map[f.id] = {
          hasErrors: diagnostics.diagnostics.some((d) => d.severity === "error"),
          hasWarnings: diagnostics.diagnostics.some((d) => d.severity === "warning"),
        };
      } else {
        const result = compile(f.content);
        map[f.id] = {
          hasErrors: result.diagnostics.some((d) => d.severity === "error"),
          hasWarnings: result.diagnostics.some((d) => d.severity === "warning"),
        };
      }
    }
    return map;
  }, [files, activeFileId, diagnostics]);

  const namespaceGroups = useMemo(() => {
    const groups: Record<string, ConfigFile[]> = {};
    for (const f of files) {
      const ns = f.namespace || "default";
      if (!groups[ns]) groups[ns] = [];
      groups[ns].push(f);
    }
    return groups;
  }, [files]);

  useEffect(() => {
    saveFiles(files);
  }, [files]);

  const updateFileContent = useCallback((content: string) => {
    if (!activeFileId) return;
    setFiles((prev) => prev.map((f) => f.id === activeFileId ? { ...f, content } : f));
  }, [activeFileId]);

  const createFile = useCallback((name: string, namespace: string, content = "") => {
    const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const file: ConfigFile = {
      id,
      name: name.endsWith(".yaml") ? name : `${name}.yaml`,
      namespace,
      content,
      createdAt: Date.now(),
    };
    setFiles((prev) => [...prev, file]);
    setActiveFileId(id);
    setExpandedNs((prev) => ({ ...prev, [namespace]: true }));
    setShowNewFile(false);
    setNewFileName("");
  }, []);

  const deleteFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (activeFileId === id) setActiveFileId(null);
  }, [activeFileId]);

  const applyTemplate = useCallback((template: ConfigTemplate) => {
    createFile(template.id, newFileNs || "default", template.yaml);
    setTemplateOpen(false);
  }, [createFile, newFileNs]);

  const copyToClipboard = useCallback(async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const runAiTest = useCallback(async () => {
    if (!activeFile) return;
    setAiTesting(true);
    setAiResult(null);

    try {
      const systemPrompt = `You are a Kubernetes configuration expert. Analyze the following YAML configuration and check for:
1. Security issues (running as root, no security context, excessive privileges)
2. Best practice violations (no resource limits, no health checks, latest tag)
3. Configuration errors (wrong API versions, missing required fields)
4. Reliability issues (no PDB, no anti-affinity, single replica for production)
5. Networking issues (port mismatches, selector mismatches)

Respond in this exact JSON format:
{
  "issues": [
    {"severity": "error|warning|info", "title": "Short title", "description": "Detailed explanation", "fix": "How to fix it"}
  ],
  "summary": "One sentence overall assessment"
}

Only output valid JSON, nothing else.`;

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: `Analyze this Kubernetes YAML:\n\n\`\`\`yaml\n${activeFile.content}\n\`\`\`` }],
          systemPrompt,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setAiResult({
          issues: [{ severity: "error", title: "AI Unavailable", description: err.error || "Failed to reach AI", fix: "Configure AI in Settings" }],
          summary: "AI testing requires an API key configured in Settings.",
        });
        setAiTesting(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) fullText += parsed.content;
          } catch {}
        }
      }

      try {
        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]) as AiTestResult;
          setAiResult(result);
        } else {
          setAiResult({ issues: [], summary: fullText || "No issues found." });
        }
      } catch {
        setAiResult({ issues: [], summary: fullText || "Analysis complete." });
      }
    } catch (err) {
      setAiResult({
        issues: [{ severity: "error", title: "Error", description: String(err), fix: "Check network connection" }],
        summary: "Test failed.",
      });
    }
    setAiTesting(false);
  }, [activeFile]);

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const newVal = val.substring(0, start) + "  " + val.substring(end);
      updateFileContent(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }, [updateFileContent]);

  const syncScroll = useCallback(() => {
    if (editorRef.current && lineNumberRef.current) {
      lineNumberRef.current.scrollTop = editorRef.current.scrollTop;
    }
  }, []);

  const lineCount = activeFile ? (activeFile.content.match(/\n/g) || []).length + 1 : 0;
  const errorLines = new Set(diagnostics.diagnostics.filter((d) => d.severity === "error").map((d) => d.line));
  const warnLines = new Set(diagnostics.diagnostics.filter((d) => d.severity === "warning").map((d) => d.line));

  const commands = useMemo(() => {
    if (!activeFile || !commandMode) return [];
    const text = activeFile.content;
    if (commandMode === "apply") {
      return [
        generateDryRunCommand(text, activeFile.name),
        generateDiffCommand(text, activeFile.name),
        ...generateApplyCommands(text, activeFile.name),
      ];
    }
    if (commandMode === "sequence") return generateSequencedCommands(text);
    return [];
  }, [activeFile, commandMode]);

  const errorCount = diagnostics.diagnostics.filter((d) => d.severity === "error").length;
  const warnCount = diagnostics.diagnostics.filter((d) => d.severity === "warning").length;
  const infoCount = diagnostics.diagnostics.filter((d) => d.severity === "info" || d.severity === "hint").length;

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* File Tree Sidebar */}
      <div className="w-[220px] flex-shrink-0 border-r border-border flex flex-col bg-[var(--terminal-bg)]">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Config Files</span>
          <button
            onClick={() => setShowNewFile(true)}
            className="text-muted-foreground hover:text-neon-cyan transition-colors"
            title="New file"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {showNewFile && (
          <div className="p-2 border-b border-border space-y-1.5">
            <input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="filename.yaml"
              className="w-full text-[11px] px-2 py-1 rounded border border-border bg-background text-foreground focus:border-neon-cyan focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFileName.trim()) createFile(newFileName.trim(), newFileNs);
                if (e.key === "Escape") setShowNewFile(false);
              }}
            />
            <select
              value={newFileNs}
              onChange={(e) => setNewFileNs(e.target.value)}
              className="w-full text-[11px] px-2 py-1 rounded border border-border bg-background text-foreground focus:outline-none"
            >
              {Object.keys(namespaceGroups).map((ns) => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
              <option value="__new__">+ New Namespace</option>
            </select>
            {newFileNs === "__new__" && (
              <input
                placeholder="namespace name"
                className="w-full text-[11px] px-2 py-1 rounded border border-border bg-background text-foreground focus:outline-none"
                onBlur={(e) => { if (e.target.value.trim()) setNewFileNs(e.target.value.trim()); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setNewFileNs(e.currentTarget.value.trim() || "default");
                }}
                autoFocus
              />
            )}
            <div className="flex gap-1">
              <button
                onClick={() => { if (newFileName.trim()) createFile(newFileName.trim(), newFileNs === "__new__" ? "default" : newFileNs); }}
                className="flex-1 text-[10px] px-2 py-1 rounded bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 hover:bg-neon-cyan/20"
              >
                Create
              </button>
              <button
                onClick={() => setShowNewFile(false)}
                className="text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-1">
          {Object.entries(namespaceGroups).sort(([a], [b]) => a.localeCompare(b)).map(([ns, nsFiles]) => (
            <div key={ns}>
              <button
                onClick={() => setExpandedNs((prev) => ({ ...prev, [ns]: !prev[ns] }))}
                className="w-full flex items-center gap-1.5 px-2 py-[5px] text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                {expandedNs[ns] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <FolderOpen className="w-3 h-3" />
                <span className="flex-1 text-left">{ns}</span>
                <span className="text-[9px] text-muted-foreground/60">{nsFiles.length}</span>
              </button>
              {expandedNs[ns] && nsFiles.map((f) => {
                const status = fileStatus[f.id];
                const hasErrors = status?.hasErrors ?? false;
                const hasWarnings = status?.hasWarnings ?? false;
                return (
                  <div
                    key={f.id}
                    className={cn(
                      "group flex items-center gap-1.5 pl-7 pr-2 py-[5px] text-[11px] cursor-pointer transition-colors",
                      activeFileId === f.id
                        ? "text-neon-cyan bg-neon-cyan/8 border-r-2 border-neon-cyan"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                    )}
                    onClick={() => { setActiveFileId(f.id); setAiResult(null); }}
                  >
                    <FileCode className="w-3 h-3 flex-shrink-0 opacity-70" />
                    <span className="flex-1 truncate">{f.name}</span>
                    {hasErrors && <AlertCircle className="w-2.5 h-2.5 text-neon-red" />}
                    {!hasErrors && hasWarnings && <AlertTriangle className="w-2.5 h-2.5 text-neon-amber" />}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteFile(f.id); }}
                      className="hidden group-hover:block text-muted-foreground hover:text-neon-red"
                      title="Delete file"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
          {files.length === 0 && (
            <div className="px-3 py-6 text-center text-[11px] text-muted-foreground">
              <p>No config files yet</p>
              <p className="mt-1">Create a new file or use a template</p>
            </div>
          )}
        </div>

        <div className="border-t border-border p-1.5">
          <button
            onClick={() => setTemplateOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] text-muted-foreground hover:text-neon-purple hover:bg-neon-purple/5 transition-colors rounded"
          >
            <LayoutTemplate className="w-3 h-3" />
            Templates
          </button>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        {activeFile && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/50">
            <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-foreground">{activeFile.name}</span>
            <span className="text-[9px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50">{activeFile.namespace}</span>

            <div className="flex-1" />

            {/* Diagnostics summary */}
            <div className="flex items-center gap-2 text-[10px]">
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-neon-red">
                  <AlertCircle className="w-3 h-3" /> {errorCount}
                </span>
              )}
              {warnCount > 0 && (
                <span className="flex items-center gap-1 text-neon-amber">
                  <AlertTriangle className="w-3 h-3" /> {warnCount}
                </span>
              )}
              {infoCount > 0 && (
                <span className="flex items-center gap-1 text-neon-cyan">
                  <Info className="w-3 h-3" /> {infoCount}
                </span>
              )}
              {diagnostics.valid && errorCount === 0 && warnCount === 0 && activeFile.content.trim() && (
                <span className="flex items-center gap-1 text-neon-green">
                  <Check className="w-3 h-3" /> Valid
                </span>
              )}
            </div>

            <div className="w-px h-4 bg-border mx-1" />

            <button
              onClick={() => copyToClipboard(activeFile.content, "yaml")}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
              title="Copy YAML"
            >
              {copiedId === "yaml" ? <Check className="w-3 h-3 text-neon-green" /> : <Copy className="w-3 h-3" />}
              Copy
            </button>

            <button
              onClick={() => setCommandMode(commandMode === "apply" ? null : "apply")}
              className={cn(
                "flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors",
                commandMode === "apply"
                  ? "bg-neon-green/10 border-neon-green/50 text-neon-green"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"
              )}
            >
              <Terminal className="w-3 h-3" /> Commands
            </button>

            <button
              onClick={() => setCommandMode(commandMode === "sequence" ? null : "sequence")}
              className={cn(
                "flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors",
                commandMode === "sequence"
                  ? "bg-neon-purple/10 border-neon-purple/50 text-neon-purple"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"
              )}
            >
              <ListOrdered className="w-3 h-3" /> Sequence
            </button>

            <button
              onClick={runAiTest}
              disabled={aiTesting || !activeFile.content.trim()}
              className={cn(
                "flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors",
                aiTesting
                  ? "border-neon-amber/50 text-neon-amber bg-neon-amber/10"
                  : "border-border text-muted-foreground hover:text-neon-amber hover:border-neon-amber/30 hover:bg-neon-amber/5"
              )}
            >
              {aiTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              AI Test
            </button>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Editor */}
          {activeFile ? (
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <div className="flex-1 flex overflow-hidden font-mono text-[12px]">
                {/* Line numbers */}
                <div
                  ref={lineNumberRef}
                  className="w-[50px] flex-shrink-0 overflow-hidden select-none bg-[var(--terminal-bg)] border-r border-border"
                >
                  <div className="py-2 px-1">
                    {Array.from({ length: lineCount }, (_, i) => {
                      const lineNum = i + 1;
                      const isError = errorLines.has(lineNum);
                      const isWarn = warnLines.has(lineNum);
                      return (
                        <div
                          key={i}
                          className={cn(
                            "text-right pr-2 leading-[20px] text-[11px]",
                            isError ? "text-neon-red bg-neon-red/10" :
                            isWarn ? "text-neon-amber bg-neon-amber/10" :
                            "text-muted-foreground/40"
                          )}
                        >
                          {lineNum}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Textarea */}
                <textarea
                  ref={editorRef}
                  value={activeFile.content}
                  onChange={(e) => updateFileContent(e.target.value)}
                  onKeyDown={handleEditorKeyDown}
                  onScroll={syncScroll}
                  spellCheck={false}
                  className="flex-1 resize-none bg-background text-foreground p-2 focus:outline-none leading-[20px] overflow-auto font-mono"
                  placeholder="Start typing YAML or use a template..."
                />
              </div>

              {/* Command Panel */}
              {commandMode && commands.length > 0 && (
                <div className="border-t border-border bg-[var(--terminal-bg)] max-h-[200px] overflow-y-auto">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      {commandMode === "apply" ? "Apply Commands" : "Sequenced Commands"}
                    </span>
                    <button onClick={() => setCommandMode(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {commands.map((cmd, i) => (
                    <div key={i} className="px-3 py-2 border-b border-border/30 hover:bg-accent/20 group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-medium text-foreground">{cmd.label}</span>
                        <button
                          onClick={() => copyToClipboard(cmd.command, `cmd-${i}`)}
                          className="text-muted-foreground hover:text-neon-cyan transition-colors"
                        >
                          {copiedId === `cmd-${i}` ? <Check className="w-3 h-3 text-neon-green" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <p className="text-[9px] text-muted-foreground mb-1">{cmd.description}</p>
                      <pre className="text-[10px] text-neon-green bg-black/30 rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap break-all">
                        {cmd.command}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground max-w-sm">
                <FileCode className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium mb-1">K8s Config Studio</p>
                <p className="text-[11px] mb-4">Create YAML configurations with real-time validation, templates, and AI-powered testing.</p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => setShowNewFile(true)}
                    className="text-[11px] px-3 py-1.5 rounded border border-neon-cyan/50 text-neon-cyan hover:bg-neon-cyan/10 transition-colors"
                  >
                    New File
                  </button>
                  <button
                    onClick={() => setTemplateOpen(true)}
                    className="text-[11px] px-3 py-1.5 rounded border border-neon-purple/50 text-neon-purple hover:bg-neon-purple/10 transition-colors"
                  >
                    From Template
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Right Panel: Diagnostics + AI Results */}
          {activeFile && (
            <div className="w-[320px] flex-shrink-0 border-l border-border flex flex-col overflow-hidden bg-card/30">
              {/* Compiler Diagnostics */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-3 py-2 border-b border-border sticky top-0 bg-card/80 backdrop-blur-sm z-10">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Compiler Output
                  </span>
                </div>

                {diagnostics.diagnostics.length === 0 && activeFile.content.trim() && (
                  <div className="px-3 py-4 text-center">
                    <Check className="w-5 h-5 text-neon-green mx-auto mb-1" />
                    <p className="text-[11px] text-neon-green">No issues found</p>
                  </div>
                )}

                {diagnostics.diagnostics.length === 0 && !activeFile.content.trim() && (
                  <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
                    Start typing to see validation
                  </div>
                )}

                <div className="px-2 py-1 space-y-1">
                  {diagnostics.diagnostics.map((d, i) => (
                    <div
                      key={i}
                      className={cn("rounded border px-2 py-1.5 cursor-pointer hover:opacity-90", severityColor(d.severity))}
                      onClick={() => {
                        if (editorRef.current) {
                          const lines = activeFile.content.split("\n");
                          let pos = 0;
                          for (let l = 0; l < Math.min(d.line - 1, lines.length); l++) {
                            pos += lines[l].length + 1;
                          }
                          editorRef.current.focus();
                          editorRef.current.setSelectionRange(pos, pos + (lines[d.line - 1]?.length || 0));
                        }
                      }}
                    >
                      <div className="flex items-start gap-1.5">
                        {severityIcon(d.severity)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground">L{d.line}</span>
                            <span className="text-[11px] text-foreground">{d.message}</span>
                          </div>
                          {d.fix && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-start gap-1">
                              <Lightbulb className="w-2.5 h-2.5 mt-0.5 flex-shrink-0 text-neon-purple" />
                              {d.fix}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Resource Summary */}
                {diagnostics.documents.length > 0 && (
                  <div className="px-3 py-2 border-t border-border mt-2">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Resources ({diagnostics.documents.length})
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {diagnostics.documents.map((doc, i) => {
                        const meta = doc.metadata as Record<string, unknown> | undefined;
                        return (
                          <div key={i} className="flex items-center gap-1.5 text-[11px]">
                            <span className="text-neon-cyan">{doc.kind as string}</span>
                            <span className="text-muted-foreground">/</span>
                            <span className="text-foreground">{(meta?.name as string) || "unnamed"}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* AI Test Results */}
              {(aiResult || aiTesting) && (
                <div className="border-t border-border max-h-[45%] overflow-y-auto bg-card/50">
                  <div className="px-3 py-2 border-b border-border sticky top-0 bg-card/80 backdrop-blur-sm z-10 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-neon-amber font-semibold flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> AI Analysis
                    </span>
                    {aiResult && (
                      <button onClick={() => setAiResult(null)} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {aiTesting && (
                    <div className="px-3 py-4 text-center">
                      <Loader2 className="w-5 h-5 animate-spin text-neon-amber mx-auto mb-1" />
                      <p className="text-[11px] text-muted-foreground">Analyzing configuration...</p>
                    </div>
                  )}

                  {aiResult && (
                    <div className="px-2 py-1 space-y-1">
                      {aiResult.summary && (
                        <p className="text-[11px] text-foreground px-1 py-1">{aiResult.summary}</p>
                      )}
                      {aiResult.issues.map((issue, i) => (
                        <div
                          key={i}
                          className={cn(
                            "rounded border px-2 py-1.5",
                            issue.severity === "error" ? "border-neon-red/30 bg-neon-red/5" :
                            issue.severity === "warning" ? "border-neon-amber/30 bg-neon-amber/5" :
                            "border-neon-cyan/30 bg-neon-cyan/5"
                          )}
                        >
                          <p className="text-[11px] font-medium text-foreground">{issue.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{issue.description}</p>
                          {issue.fix && (
                            <p className="text-[10px] mt-0.5 flex items-start gap-1">
                              <Lightbulb className="w-2.5 h-2.5 mt-0.5 flex-shrink-0 text-neon-purple" />
                              <span className="text-neon-purple">{issue.fix}</span>
                            </p>
                          )}
                        </div>
                      ))}
                      {aiResult.issues.length === 0 && (
                        <div className="text-center py-2">
                          <Check className="w-5 h-5 text-neon-green mx-auto mb-1" />
                          <p className="text-[11px] text-neon-green">AI found no issues</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Template Modal */}
      {templateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-2xl w-[700px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-medium">Choose a Template</span>
              <button onClick={() => setTemplateOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 py-2 border-b border-border">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Target Namespace</label>
              <input
                value={newFileNs}
                onChange={(e) => setNewFileNs(e.target.value)}
                className="w-full text-[11px] px-2 py-1 mt-1 rounded border border-border bg-background text-foreground focus:border-neon-cyan focus:outline-none"
                placeholder="default"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {Object.entries(getTemplatesByCategory()).map(([category, templates]) => (
                <div key={category} className="mb-4">
                  <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">{category}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t)}
                        className="text-left p-3 rounded border border-border hover:border-neon-cyan/50 hover:bg-neon-cyan/5 transition-colors group"
                      >
                        <p className="text-[11px] font-medium text-foreground group-hover:text-neon-cyan">{t.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{t.description}</p>
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {t.kinds.map((k) => (
                            <span key={k} className="text-[8px] px-1 py-0.5 rounded bg-muted text-muted-foreground">{k}</span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
