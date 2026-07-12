"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, RefreshCw, ChevronRight, Shield, Key, User } from "lucide-react";

interface RoleRule {
  apiGroups: string[];
  resources: string[];
  verbs: string[];
}

interface RoleItem {
  name: string;
  namespace?: string;
  rules: RoleRule[];
  ruleCount: number;
}

interface BindingSubject {
  kind: string;
  name: string;
  namespace?: string;
}

interface BindingItem {
  name: string;
  namespace?: string;
  roleRef: { kind: string; name: string };
  subjects: BindingSubject[];
}

interface ServiceAccount {
  name: string;
  namespace?: string;
}

interface RbacViewerProps {
  cluster: string | null;
}

type Tab = "clusterRoles" | "roles" | "bindings" | "serviceAccounts";

export function RbacViewer({ cluster }: RbacViewerProps) {
  const [clusterRoles, setClusterRoles] = useState<RoleItem[]>([]);
  const [clusterRoleBindings, setClusterRoleBindings] = useState<BindingItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [roleBindings, setRoleBindings] = useState<BindingItem[]>([]);
  const [serviceAccounts, setServiceAccounts] = useState<ServiceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("clusterRoles");
  const [selectedRole, setSelectedRole] = useState<RoleItem | null>(null);
  const [search, setSearch] = useState("");

  const fetchRbac = useCallback(async () => {
    if (!cluster) return;
    try {
      const res = await fetch(`/api/rbac/${encodeURIComponent(cluster)}`);
      const data = await res.json();
      setClusterRoles(data.clusterRoles || []);
      setClusterRoleBindings(data.clusterRoleBindings || []);
      setRoles(data.roles || []);
      setRoleBindings(data.roleBindings || []);
      setServiceAccounts(data.serviceAccounts || []);
    } catch {
      setClusterRoles([]);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [cluster]);

  useEffect(() => {
    fetchRbac();
  }, [fetchRbac]);

  const filteredClusterRoles = clusterRoles.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  const filteredRoles = roles.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  const allBindings = [...clusterRoleBindings, ...roleBindings].filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));
  const filteredSAs = serviceAccounts.filter((sa) => sa.name.toLowerCase().includes(search.toLowerCase()));

  const getVerbColor = (verb: string) => {
    if (["create", "update", "patch", "delete", "deletecollection"].includes(verb)) return "text-neon-red";
    if (["get", "list", "watch"].includes(verb)) return "text-neon-green";
    if (verb === "*") return "text-neon-amber";
    return "text-muted-foreground";
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-5 h-5 text-neon-cyan animate-spin mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Loading RBAC...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-neon-cyan" />
          <span className="text-sm font-medium">RBAC Viewer</span>
        </div>
        <button onClick={fetchRbac} className="p-1 rounded hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-4 py-2 border-b border-border flex items-center gap-2">
        <div className="flex rounded border border-border overflow-hidden">
          {([
            ["clusterRoles", `ClusterRoles (${filteredClusterRoles.length})`],
            ["roles", `Roles (${filteredRoles.length})`],
            ["bindings", `Bindings (${allBindings.length})`],
            ["serviceAccounts", `SAs (${filteredSAs.length})`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setTab(key); setSelectedRole(null); }}
              className={`px-2.5 py-1 text-[10px] transition-colors ${
                tab === key ? "bg-neon-cyan/10 text-neon-cyan" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Filter..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent border border-border rounded px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-neon-cyan/50"
        />
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto p-4">
          {(tab === "clusterRoles" || tab === "roles") && (
            <div className="space-y-1">
              {(tab === "clusterRoles" ? filteredClusterRoles : filteredRoles).map((role) => (
                <button
                  key={`${role.namespace || "cluster"}/${role.name}`}
                  onClick={() => setSelectedRole(role)}
                  className={`w-full text-left p-2 rounded flex items-center gap-2 transition-colors ${
                    selectedRole?.name === role.name ? "bg-neon-cyan/10 border border-neon-cyan/30" : "hover:bg-accent/20 border border-transparent"
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate">{role.name}</p>
                    {role.namespace && <p className="text-[9px] text-muted-foreground">{role.namespace}</p>}
                  </div>
                  <span className="text-[9px] text-muted-foreground font-mono">{role.ruleCount} rules</span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
                </button>
              ))}
              {(tab === "clusterRoles" ? filteredClusterRoles : filteredRoles).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No roles found</p>
              )}
            </div>
          )}

          {tab === "bindings" && (
            <div className="space-y-2">
              {allBindings.map((binding) => (
                <div key={`${binding.namespace || "cluster"}/${binding.name}`} className="p-2.5 rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Key className="w-3.5 h-3.5 text-neon-amber" />
                    <span className="text-xs font-medium truncate">{binding.name}</span>
                    {binding.namespace && <span className="text-[9px] text-muted-foreground">{binding.namespace}</span>}
                  </div>
                  <div className="flex items-center gap-1 mb-2">
                    <span className="text-[9px] text-muted-foreground">Role:</span>
                    <span className="text-[10px] font-mono text-neon-cyan">{binding.roleRef.kind}/{binding.roleRef.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {binding.subjects.map((s, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                        <User className="w-2.5 h-2.5" />
                        {s.kind}: {s.name}
                        {s.namespace && ` (${s.namespace})`}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {allBindings.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No bindings found</p>
              )}
            </div>
          )}

          {tab === "serviceAccounts" && (
            <div className="space-y-1">
              {filteredSAs.map((sa) => (
                <div key={`${sa.namespace}/${sa.name}`} className="p-2 rounded flex items-center gap-2 hover:bg-accent/20">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs">{sa.name}</span>
                  <span className="text-[9px] text-muted-foreground">{sa.namespace}</span>
                </div>
              ))}
              {filteredSAs.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No service accounts found</p>
              )}
            </div>
          )}
        </div>

        {selectedRole && (
          <div className="w-96 border-l border-border overflow-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium truncate">{selectedRole.name}</span>
              <button onClick={() => setSelectedRole(null)} className="text-muted-foreground hover:text-foreground text-xs">x</button>
            </div>
            {selectedRole.namespace && (
              <p className="text-[10px] text-muted-foreground mb-3">Namespace: {selectedRole.namespace}</p>
            )}
            <p className="text-[10px] text-muted-foreground uppercase mb-2">Rules ({selectedRole.rules.length})</p>
            <div className="space-y-2">
              {selectedRole.rules.map((rule, i) => (
                <div key={i} className="p-2 rounded bg-muted/30 border border-border/50">
                  <div className="mb-1.5">
                    <span className="text-[9px] text-muted-foreground">API Groups: </span>
                    <span className="text-[10px] font-mono">
                      {rule.apiGroups.map((g) => g || '""').join(", ")}
                    </span>
                  </div>
                  <div className="mb-1.5">
                    <span className="text-[9px] text-muted-foreground">Resources: </span>
                    <span className="text-[10px] font-mono">{rule.resources.join(", ")}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {rule.verbs.map((v) => (
                      <span key={v} className={`text-[9px] px-1.5 py-0.5 rounded bg-muted/50 font-mono ${getVerbColor(v)}`}>
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
