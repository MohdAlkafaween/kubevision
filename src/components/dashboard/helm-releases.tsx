"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Package,
  RefreshCw,
  Trash2,
  ArrowUpCircle,
  RotateCcw,
  Plus,
  Search,
  Loader2,
  Check,
  X,
  ChevronRight,
  ExternalLink,
  BookOpen,
  FolderPlus,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface HelmRelease {
  name: string;
  namespace: string;
  chart: string;
  version: string;
  appVersion: string;
  status: string;
  revision: number;
  updated: string;
}

interface HelmChart {
  name: string;
  version: string;
  app_version: string;
  description: string;
}

interface HelmRepo {
  name: string;
  url: string;
}

type Tab = "releases" | "install" | "repos";

export function HelmReleases({ cluster }: { cluster: string | null }) {
  const [releases, setReleases] = useState<HelmRelease[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("releases");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [selectedRelease, setSelectedRelease] = useState<HelmRelease | null>(null);

  // Install state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<HelmChart[]>([]);
  const [searching, setSearching] = useState(false);
  const [installForm, setInstallForm] = useState({ chart: "", releaseName: "", namespace: "default", version: "" });
  const [installing, setInstalling] = useState(false);

  // Repos state
  const [repos, setRepos] = useState<HelmRepo[]>([]);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [newRepo, setNewRepo] = useState({ name: "", url: "" });
  const [addingRepo, setAddingRepo] = useState(false);

  const fetchReleases = useCallback(async () => {
    if (!cluster) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/helm/${encodeURIComponent(cluster)}/releases`);
      const data = await res.json();
      setReleases(data.releases || []);
    } catch {
      setReleases([]);
    } finally {
      setLoading(false);
    }
  }, [cluster]);

  const fetchRepos = useCallback(async () => {
    if (!cluster) return;
    try {
      const res = await fetch(`/api/helm/${encodeURIComponent(cluster)}/repos`);
      const data = await res.json();
      setRepos(data.repos || []);
    } catch {
      setRepos([]);
    }
  }, [cluster]);

  useEffect(() => {
    fetchReleases();
    fetchRepos();
  }, [fetchReleases, fetchRepos]);

  const showResult = (type: "success" | "error", message: string) => {
    setActionResult({ type, message });
    setTimeout(() => setActionResult(null), 4000);
  };

  const handleUninstall = async (release: HelmRelease) => {
    if (!cluster) return;
    setActionLoading(`uninstall-${release.name}`);
    try {
      const res = await fetch(`/api/helm/${encodeURIComponent(cluster)}/uninstall`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseName: release.name, namespace: release.namespace }),
      });
      const data = await res.json();
      if (data.error) {
        showResult("error", data.error);
      } else {
        showResult("success", `Uninstalled ${release.name}`);
        fetchReleases();
        setSelectedRelease(null);
      }
    } catch {
      showResult("error", "Failed to uninstall");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRollback = async (release: HelmRelease) => {
    if (!cluster) return;
    setActionLoading(`rollback-${release.name}`);
    try {
      const res = await fetch(`/api/helm/${encodeURIComponent(cluster)}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseName: release.name, namespace: release.namespace }),
      });
      const data = await res.json();
      if (data.error) {
        showResult("error", data.error);
      } else {
        showResult("success", `Rolled back ${release.name}`);
        fetchReleases();
      }
    } catch {
      showResult("error", "Failed to rollback");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSearch = async () => {
    if (!cluster) return;
    setSearching(true);
    try {
      const res = await fetch(
        `/api/helm/${encodeURIComponent(cluster)}/search?q=${encodeURIComponent(searchQuery)}`
      );
      const data = await res.json();
      setSearchResults(data.charts || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleInstall = async () => {
    if (!cluster || !installForm.chart || !installForm.releaseName) return;
    setInstalling(true);
    try {
      const res = await fetch(`/api/helm/${encodeURIComponent(cluster)}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(installForm),
      });
      const data = await res.json();
      if (data.error) {
        showResult("error", data.error);
      } else {
        showResult("success", `Installed ${installForm.releaseName}`);
        setInstallForm({ chart: "", releaseName: "", namespace: "default", version: "" });
        setActiveTab("releases");
        fetchReleases();
      }
    } catch {
      showResult("error", "Failed to install chart");
    } finally {
      setInstalling(false);
    }
  };

  const handleAddRepo = async () => {
    if (!cluster || !newRepo.name || !newRepo.url) return;
    setAddingRepo(true);
    try {
      const res = await fetch(`/api/helm/${encodeURIComponent(cluster)}/repos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRepo),
      });
      const data = await res.json();
      if (data.error) {
        showResult("error", data.error);
      } else {
        showResult("success", `Added repo ${newRepo.name}`);
        setNewRepo({ name: "", url: "" });
        setShowAddRepo(false);
        fetchRepos();
      }
    } catch {
      showResult("error", "Failed to add repo");
    } finally {
      setAddingRepo(false);
    }
  };

  const handleRemoveRepo = async (name: string) => {
    if (!cluster) return;
    setActionLoading(`repo-${name}`);
    try {
      const res = await fetch(`/api/helm/${encodeURIComponent(cluster)}/repos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.error) {
        showResult("error", data.error);
      } else {
        showResult("success", `Removed repo ${name}`);
        fetchRepos();
      }
    } catch {
      showResult("error", "Failed to remove repo");
    } finally {
      setActionLoading(null);
    }
  };

  const statusColor = (status: string) => {
    if (status === "deployed") return "text-neon-green";
    if (status === "failed") return "text-neon-red";
    if (status === "pending-install" || status === "pending-upgrade") return "text-neon-amber";
    if (status === "superseded") return "text-muted-foreground";
    if (status === "uninstalling") return "text-neon-red";
    return "text-muted-foreground";
  };

  if (!cluster) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Select a cluster to manage Helm releases</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Tab bar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-[var(--terminal-header)]">
          {([
            { id: "releases" as Tab, label: "Releases", icon: Package },
            { id: "install" as Tab, label: "Install Chart", icon: Plus },
            { id: "repos" as Tab, label: "Repositories", icon: BookOpen },
          ]).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] transition-colors ${
                  activeTab === tab.id
                    ? "bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                }`}
              >
                <Icon className="w-3 h-3" />
                {tab.label}
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-2">
            {actionResult && (
              <span className={`text-[10px] flex items-center gap-1 ${actionResult.type === "success" ? "text-neon-green" : "text-neon-red"}`}>
                {actionResult.type === "success" ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                {actionResult.message}
              </span>
            )}
            <button
              onClick={fetchReleases}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Releases tab */}
        {activeTab === "releases" && (
          <div className="flex flex-1 overflow-hidden">
            <ScrollArea className="flex-1">
              {loading && releases.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 text-neon-cyan animate-spin" />
                </div>
              ) : releases.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Package className="w-10 h-10 text-muted-foreground/20 mb-3" />
                  <p className="text-xs text-muted-foreground mb-1">No Helm releases found</p>
                  <p className="text-[10px] text-muted-foreground/60">Install a chart to get started</p>
                  <button
                    onClick={() => setActiveTab("install")}
                    className="mt-3 flex items-center gap-1 px-3 py-1.5 rounded text-[10px] bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 hover:bg-neon-cyan/20 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Install Chart
                  </button>
                </div>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider">
                      <th className="text-left px-4 py-2 font-medium">Name</th>
                      <th className="text-left px-4 py-2 font-medium">Namespace</th>
                      <th className="text-left px-4 py-2 font-medium">Chart</th>
                      <th className="text-left px-4 py-2 font-medium">Version</th>
                      <th className="text-left px-4 py-2 font-medium">Status</th>
                      <th className="text-left px-4 py-2 font-medium">Rev</th>
                      <th className="text-right px-4 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {releases.map((r) => (
                      <tr
                        key={`${r.namespace}/${r.name}`}
                        onClick={() => setSelectedRelease(r)}
                        className={`border-b border-border/50 cursor-pointer transition-colors ${
                          selectedRelease?.name === r.name
                            ? "bg-neon-cyan/5"
                            : "hover:bg-accent/20"
                        }`}
                      >
                        <td className="px-4 py-2.5 font-medium text-foreground">{r.name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground font-mono">{r.namespace}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.chart}</td>
                        <td className="px-4 py-2.5 font-mono text-neon-purple">{r.version}</td>
                        <td className="px-4 py-2.5">
                          <span className={`flex items-center gap-1 ${statusColor(r.status)}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              r.status === "deployed" ? "bg-neon-green" :
                              r.status === "failed" ? "bg-neon-red" : "bg-neon-amber"
                            }`} />
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">{r.revision}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRollback(r); }}
                              disabled={actionLoading === `rollback-${r.name}` || r.revision <= 1}
                              className="p-1 rounded text-muted-foreground hover:text-neon-amber hover:bg-neon-amber/10 transition-colors disabled:opacity-30"
                              title="Rollback"
                            >
                              {actionLoading === `rollback-${r.name}` ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleUninstall(r); }}
                              disabled={actionLoading === `uninstall-${r.name}`}
                              className="p-1 rounded text-muted-foreground hover:text-neon-red hover:bg-neon-red/10 transition-colors disabled:opacity-30"
                              title="Uninstall"
                            >
                              {actionLoading === `uninstall-${r.name}` ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ScrollArea>

            {/* Release detail sidebar */}
            {selectedRelease && (
              <div className="w-72 flex-shrink-0 border-l border-border bg-[var(--terminal-bg)] flex flex-col">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[var(--terminal-header)]">
                  <span className="text-xs font-medium text-foreground">{selectedRelease.name}</span>
                  <button onClick={() => setSelectedRelease(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-3 space-y-3 text-[11px]">
                  <DetailRow label="Chart" value={selectedRelease.chart} />
                  <DetailRow label="Version" value={selectedRelease.version} accent />
                  <DetailRow label="App Version" value={selectedRelease.appVersion || "—"} />
                  <DetailRow label="Namespace" value={selectedRelease.namespace} mono />
                  <DetailRow label="Status" value={selectedRelease.status} className={statusColor(selectedRelease.status)} />
                  <DetailRow label="Revision" value={String(selectedRelease.revision)} />
                  <DetailRow label="Updated" value={selectedRelease.updated ? new Date(selectedRelease.updated).toLocaleString() : "—"} />

                  <div className="pt-2 space-y-1.5">
                    <button
                      onClick={() => {
                        setInstallForm({
                          chart: selectedRelease.chart,
                          releaseName: selectedRelease.name,
                          namespace: selectedRelease.namespace,
                          version: "",
                        });
                        setActiveTab("install");
                      }}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 hover:bg-neon-cyan/20 transition-colors"
                    >
                      <ArrowUpCircle className="w-3 h-3" />
                      Upgrade Release
                    </button>
                    <button
                      onClick={() => handleRollback(selectedRelease)}
                      disabled={selectedRelease.revision <= 1}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] bg-neon-amber/10 text-neon-amber border border-neon-amber/30 hover:bg-neon-amber/20 transition-colors disabled:opacity-30"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Rollback
                    </button>
                    <button
                      onClick={() => handleUninstall(selectedRelease)}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] bg-neon-red/10 text-neon-red border border-neon-red/30 hover:bg-neon-red/20 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Uninstall
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Install tab */}
        {activeTab === "install" && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-2xl mx-auto space-y-4">
              {/* Search bar */}
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Search Charts
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      placeholder="e.g. nginx, prometheus, grafana..."
                      className="w-full bg-[var(--terminal-bg)] text-xs text-foreground border border-border rounded pl-8 pr-3 py-2 focus:outline-none focus:border-neon-cyan font-mono"
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={searching}
                    className="flex items-center gap-1 px-4 py-2 rounded text-[10px] font-medium bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 hover:bg-neon-cyan/20 transition-colors disabled:opacity-50"
                  >
                    {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                    Search
                  </button>
                </div>
              </div>

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-border bg-[var(--terminal-header)]">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {searchResults.length} charts found
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-border/50">
                    {searchResults.slice(0, 20).map((c) => (
                      <button
                        key={c.name}
                        onClick={() => {
                          setInstallForm((f) => ({
                            ...f,
                            chart: c.name,
                            releaseName: f.releaseName || c.name.split("/").pop() || "",
                            version: c.version,
                          }));
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent/20 transition-colors ${
                          installForm.chart === c.name ? "bg-neon-cyan/5" : ""
                        }`}
                      >
                        <Package className="w-3.5 h-3.5 text-neon-purple flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-foreground font-medium truncate">{c.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{c.description}</div>
                        </div>
                        <span className="text-[10px] text-neon-purple font-mono flex-shrink-0">{c.version}</span>
                        <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Install form */}
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-border bg-[var(--terminal-header)]">
                  <span className="text-[10px] text-neon-green uppercase tracking-wider font-semibold">Install Configuration</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Chart</label>
                      <input
                        type="text"
                        value={installForm.chart}
                        onChange={(e) => setInstallForm((f) => ({ ...f, chart: e.target.value }))}
                        placeholder="repo/chart-name"
                        className="w-full bg-[var(--terminal-bg)] text-xs text-foreground border border-border rounded px-3 py-2 focus:outline-none focus:border-neon-cyan font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Release Name</label>
                      <input
                        type="text"
                        value={installForm.releaseName}
                        onChange={(e) => setInstallForm((f) => ({ ...f, releaseName: e.target.value }))}
                        placeholder="my-release"
                        className="w-full bg-[var(--terminal-bg)] text-xs text-foreground border border-border rounded px-3 py-2 focus:outline-none focus:border-neon-cyan font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Namespace</label>
                      <input
                        type="text"
                        value={installForm.namespace}
                        onChange={(e) => setInstallForm((f) => ({ ...f, namespace: e.target.value }))}
                        placeholder="default"
                        className="w-full bg-[var(--terminal-bg)] text-xs text-foreground border border-border rounded px-3 py-2 focus:outline-none focus:border-neon-cyan font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Version (optional)</label>
                      <input
                        type="text"
                        value={installForm.version}
                        onChange={(e) => setInstallForm((f) => ({ ...f, version: e.target.value }))}
                        placeholder="latest"
                        className="w-full bg-[var(--terminal-bg)] text-xs text-foreground border border-border rounded px-3 py-2 focus:outline-none focus:border-neon-cyan font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={handleInstall}
                      disabled={installing || !installForm.chart || !installForm.releaseName}
                      className="flex items-center gap-1.5 px-4 py-2 rounded text-[10px] font-medium bg-neon-green/10 text-neon-green border border-neon-green/30 hover:bg-neon-green/20 transition-colors disabled:opacity-50"
                    >
                      {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Package className="w-3 h-3" />}
                      Install
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Repos tab */}
        {activeTab === "repos" && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground font-medium">Configured Repositories ({repos.length})</span>
                <button
                  onClick={() => setShowAddRepo(!showAddRepo)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium bg-neon-green/10 text-neon-green border border-neon-green/30 hover:bg-neon-green/20 transition-colors"
                >
                  <FolderPlus className="w-3 h-3" />
                  Add Repository
                </button>
              </div>

              {showAddRepo && (
                <div className="border border-border rounded-lg p-4 bg-[var(--terminal-bg)]/50 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Name</label>
                      <input
                        type="text"
                        value={newRepo.name}
                        onChange={(e) => setNewRepo((r) => ({ ...r, name: e.target.value }))}
                        placeholder="bitnami"
                        className="w-full bg-[var(--terminal-bg)] text-xs text-foreground border border-border rounded px-3 py-2 focus:outline-none focus:border-neon-cyan font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">URL</label>
                      <input
                        type="text"
                        value={newRepo.url}
                        onChange={(e) => setNewRepo((r) => ({ ...r, url: e.target.value }))}
                        placeholder="https://charts.bitnami.com/bitnami"
                        className="w-full bg-[var(--terminal-bg)] text-xs text-foreground border border-border rounded px-3 py-2 focus:outline-none focus:border-neon-cyan font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setShowAddRepo(false); setNewRepo({ name: "", url: "" }); }}
                      className="px-3 py-1.5 rounded text-[10px] text-muted-foreground border border-border hover:text-foreground transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={handleAddRepo}
                      disabled={addingRepo || !newRepo.name || !newRepo.url}
                      className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium bg-neon-green/10 text-neon-green border border-neon-green/30 hover:bg-neon-green/20 transition-colors disabled:opacity-50"
                    >
                      {addingRepo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Add
                    </button>
                  </div>
                </div>
              )}

              <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                {repos.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <BookOpen className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No repositories configured</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Add a Helm chart repository to search and install charts</p>
                  </div>
                ) : (
                  repos.map((repo) => (
                    <div key={repo.name} className="flex items-center justify-between px-4 py-3 hover:bg-accent/10 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <BookOpen className="w-3.5 h-3.5 text-neon-purple flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[11px] text-foreground font-medium">{repo.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono truncate">{repo.url}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveRepo(repo.name)}
                        disabled={actionLoading === `repo-${repo.name}`}
                        className="p-1 rounded text-muted-foreground hover:text-neon-red hover:bg-neon-red/10 transition-colors flex-shrink-0"
                        title="Remove"
                      >
                        {actionLoading === `repo-${repo.name}` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono, accent, className }: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-[11px] ${className || ""} ${mono ? "font-mono" : ""} ${accent ? "text-neon-purple" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}
