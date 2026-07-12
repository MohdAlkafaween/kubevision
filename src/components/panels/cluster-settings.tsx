"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Save, Shield, Terminal, Trash2, FileEdit, Loader2, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ClusterConfig {
  contextName: string;
  prometheusUrl: string | null;
  displayName: string | null;
  impersonateUser: string | null;
  impersonateGroups: string | null;
  allowExec: boolean;
  allowDelete: boolean;
  allowApply: boolean;
}

interface GitOpsConfig {
  repoOwner: string;
  repoName: string;
  baseBranch: string;
  targetPath: string;
  hasToken: boolean;
}

interface ClusterSettingsProps {
  cluster: string;
  onClose: () => void;
}

export function ClusterSettings({ cluster, onClose }: ClusterSettingsProps) {
  const [config, setConfig] = useState<ClusterConfig | null>(null);
  const [gitConfig, setGitConfig] = useState<GitOpsConfig & { githubToken?: string }>({
    repoOwner: "", repoName: "", baseBranch: "main", targetPath: "k8s/", hasToken: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [clusterRes, gitRes] = await Promise.all([
        fetch(`/api/clusters/${encodeURIComponent(cluster)}/config`),
        fetch(`/api/gitops/config?context=${encodeURIComponent(cluster)}`),
      ]);
      const clusterData = await clusterRes.json();
      if (clusterData.error) throw new Error(clusterData.error);
      setConfig(clusterData.config);

      const gitData = await gitRes.json();
      if (!gitData.error) {
        setGitConfig(gitData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [cluster]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const [clusterRes, gitRes] = await Promise.all([
        fetch(`/api/clusters/${encodeURIComponent(cluster)}/config`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        }),
        fetch("/api/gitops/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: cluster,
            repoOwner: gitConfig.repoOwner,
            repoName: gitConfig.repoName,
            baseBranch: gitConfig.baseBranch,
            targetPath: gitConfig.targetPath,
            ...(gitConfig.githubToken ? { githubToken: gitConfig.githubToken } : {}),
          }),
        }),
      ]);
      const data = await clusterRes.json();
      if (data.error) throw new Error(data.error);
      setConfig(data.config);

      const gitData = await gitRes.json();
      if (gitData.error) throw new Error(gitData.error);

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof ClusterConfig>(key: K, value: ClusterConfig[K]) => {
    setConfig((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  return (
    <div className="w-[400px] flex-shrink-0 bg-[var(--terminal-bg)] border-l border-border flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-[var(--terminal-header)]">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-neon-cyan" />
          <span className="text-xs font-medium">Cluster Settings</span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-border">
            {cluster}
          </Badge>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-neon-cyan animate-spin" />
        </div>
      ) : !config ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Failed to load config
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-5">
            {/* General */}
            <Section title="General">
              <Field label="Display Name">
                <Input
                  value={config.displayName || ""}
                  onChange={(e) => updateField("displayName", e.target.value || null)}
                  placeholder={cluster}
                  className="h-7 text-xs bg-[var(--terminal-header)] border-border"
                />
              </Field>
              <Field label="Prometheus URL">
                <Input
                  value={config.prometheusUrl || ""}
                  onChange={(e) => updateField("prometheusUrl", e.target.value || null)}
                  placeholder="http://prometheus:9090"
                  className="h-7 text-xs bg-[var(--terminal-header)] border-border"
                />
              </Field>
            </Section>

            {/* RBAC Impersonation */}
            <Section title="RBAC Impersonation">
              <p className="text-[10px] text-muted-foreground mb-2">
                Commands will run as this identity instead of the kubeconfig default.
                Leave blank to use the default service account.
              </p>
              <Field label="Impersonate User">
                <Input
                  value={config.impersonateUser || ""}
                  onChange={(e) => updateField("impersonateUser", e.target.value || null)}
                  placeholder="developer@example.com"
                  className="h-7 text-xs bg-[var(--terminal-header)] border-border"
                />
              </Field>
              <Field label="Impersonate Groups">
                <Input
                  value={config.impersonateGroups || ""}
                  onChange={(e) => updateField("impersonateGroups", e.target.value || null)}
                  placeholder="dev-team, viewers (comma-separated)"
                  className="h-7 text-xs bg-[var(--terminal-header)] border-border"
                />
              </Field>
            </Section>

            {/* Command Permissions */}
            <Section title="Command Permissions">
              <p className="text-[10px] text-muted-foreground mb-2">
                Control which command categories are allowed from the terminal and command palette.
              </p>
              <ToggleRow
                icon={<Terminal className="w-3 h-3" />}
                label="Allow exec / attach / cp"
                description="Interactive container access"
                checked={config.allowExec}
                onChange={(v) => updateField("allowExec", v)}
              />
              <ToggleRow
                icon={<Trash2 className="w-3 h-3" />}
                label="Allow delete"
                description="Delete resources from the cluster"
                checked={config.allowDelete}
                onChange={(v) => updateField("allowDelete", v)}
                variant="danger"
              />
              <ToggleRow
                icon={<FileEdit className="w-3 h-3" />}
                label="Allow apply / create / patch"
                description="Modify cluster state"
                checked={config.allowApply}
                onChange={(v) => updateField("allowApply", v)}
                variant="warning"
              />
            </Section>

            {/* GitOps */}
            <Section title="GitOps Integration">
              <p className="text-[10px] text-muted-foreground mb-2">
                Connect to a GitHub repository to create PRs from the planner.
              </p>
              <Field label="GitHub Token">
                <Input
                  type="password"
                  value={gitConfig.githubToken || ""}
                  onChange={(e) => setGitConfig(prev => ({ ...prev, githubToken: e.target.value }))}
                  placeholder={gitConfig.hasToken ? "••••••••••••••" : "ghp_..."}
                  className="h-7 text-xs bg-[var(--terminal-header)] border-border"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Repo Owner">
                  <Input
                    value={gitConfig.repoOwner}
                    onChange={(e) => setGitConfig(prev => ({ ...prev, repoOwner: e.target.value }))}
                    placeholder="octocat"
                    className="h-7 text-xs bg-[var(--terminal-header)] border-border"
                  />
                </Field>
                <Field label="Repo Name">
                  <Input
                    value={gitConfig.repoName}
                    onChange={(e) => setGitConfig(prev => ({ ...prev, repoName: e.target.value }))}
                    placeholder="infra"
                    className="h-7 text-xs bg-[var(--terminal-header)] border-border"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Base Branch">
                  <Input
                    value={gitConfig.baseBranch}
                    onChange={(e) => setGitConfig(prev => ({ ...prev, baseBranch: e.target.value }))}
                    placeholder="main"
                    className="h-7 text-xs bg-[var(--terminal-header)] border-border"
                  />
                </Field>
                <Field label="Target Path">
                  <Input
                    value={gitConfig.targetPath}
                    onChange={(e) => setGitConfig(prev => ({ ...prev, targetPath: e.target.value }))}
                    placeholder="k8s/"
                    className="h-7 text-xs bg-[var(--terminal-header)] border-border"
                  />
                </Field>
              </div>
              {gitConfig.hasToken && gitConfig.repoOwner && gitConfig.repoName && (
                <div className="flex items-center gap-1.5 mt-1">
                  <GitBranch className="w-3 h-3 text-neon-green" />
                  <span className="text-[9px] text-neon-green">Connected to {gitConfig.repoOwner}/{gitConfig.repoName}</span>
                </div>
              )}
            </Section>

            {error && (
              <div className="text-[11px] text-neon-red bg-neon-red/10 border border-neon-red/30 rounded px-2 py-1.5">
                {error}
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      <div className="border-t border-border p-3 flex items-center justify-end gap-2">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded border border-neon-cyan/50 text-neon-cyan hover:bg-neon-cyan/10 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Save className="w-3 h-3" />
          )}
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
        <span>{title}</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  variant?: "default" | "warning" | "danger";
}) {
  const activeColor =
    variant === "danger"
      ? "bg-neon-red border-neon-red/50"
      : variant === "warning"
      ? "bg-neon-amber border-neon-amber/50"
      : "bg-neon-cyan border-neon-cyan/50";

  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-medium">{label}</div>
        <div className="text-[9px] text-muted-foreground">{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-8 h-4 rounded-full border transition-all relative ${
          checked ? activeColor : "bg-muted border-border"
        }`}
      >
        <div
          className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${
            checked ? "left-4" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
