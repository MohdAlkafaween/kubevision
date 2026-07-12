"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings,
  Save,
  Loader2,
  Check,
  Eye,
  EyeOff,
  Cpu,
  Key,
  Globe,
  Thermometer,
  Hash,
  Bot,
  Users,
  UserPlus,
  Trash2,
  Shield,
} from "lucide-react";

interface AiConfig {
  provider: string;
  apiKey: string;
  hasKey: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-20250514" },
  ollama: { baseUrl: "http://localhost:11434/v1", model: "llama3" },
  custom: { baseUrl: "", model: "" },
};

interface UserEntry {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export function SettingsPage() {
  const [config, setConfig] = useState<AiConfig>({
    provider: "openai",
    apiKey: "",
    hasKey: false,
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    temperature: 0.7,
    maxTokens: 4096,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [keyEdited, setKeyEdited] = useState(false);

  const [users, setUsers] = useState<UserEntry[]>([]);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", name: "", password: "", role: "viewer" });
  const [userSaving, setUserSaving] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/users");
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch {
      // ignore
    }
  }, []);

  const handleCreateUser = async () => {
    setUserSaving(true);
    setUserError(null);
    try {
      const res = await fetch("/api/settings/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (data.error) {
        setUserError(data.error);
      } else {
        setNewUser({ email: "", name: "", password: "", role: "viewer" });
        setShowCreateUser(false);
        fetchUsers();
      }
    } catch {
      setUserError("Failed to create user");
    } finally {
      setUserSaving(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      const res = await fetch("/api/settings/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.error) {
        setUserError(data.error);
      } else {
        fetchUsers();
      }
    } catch {
      setUserError("Failed to delete user");
    }
  };

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/ai");
      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
      }
    } catch {
      // use defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchUsers();
  }, [fetchConfig, fetchUsers]);

  const handleProviderChange = (provider: string) => {
    const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.custom;
    setConfig((prev) => ({
      ...prev,
      provider,
      baseUrl: defaults.baseUrl,
      model: defaults.model,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const payload: Record<string, unknown> = {
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      };
      if (keyEdited) {
        payload.apiKey = config.apiKey;
      }

      const res = await fetch("/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.error) {
        setSaveResult(data.error);
      } else {
        setSaveResult("Settings saved");
        setKeyEdited(false);
        fetchConfig();
        setTimeout(() => setSaveResult(null), 3000);
      }
    } catch {
      setSaveResult("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-neon-cyan animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center">
            <Settings className="w-4 h-4 text-neon-cyan" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">Settings</h1>
            <p className="text-[10px] text-muted-foreground">
              Configure AI assistant and application preferences
            </p>
          </div>
        </div>

        {/* AI Configuration Section */}
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-[var(--terminal-header)]">
            <Bot className="w-3.5 h-3.5 text-neon-purple" />
            <span className="text-xs font-semibold">AI Assistant Configuration</span>
          </div>

          <div className="p-4 space-y-4">
            {/* Provider */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                <Cpu className="w-3 h-3" /> Provider
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(["openai", "anthropic", "ollama", "custom"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => handleProviderChange(p)}
                    className={`text-[10px] px-3 py-1.5 rounded border transition-colors capitalize ${
                      config.provider === p
                        ? "bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan"
                        : "bg-transparent border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                    }`}
                  >
                    {p === "custom" ? "Custom/OpenAI-Compatible" : p}
                  </button>
                ))}
              </div>
            </div>

            {/* API Key */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                <Key className="w-3 h-3" /> API Key
                {config.hasKey && !keyEdited && (
                  <span className="text-neon-green text-[8px] ml-1">(configured)</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={keyEdited ? config.apiKey : config.hasKey ? config.apiKey : ""}
                  onChange={(e) => {
                    setConfig((prev) => ({ ...prev, apiKey: e.target.value }));
                    setKeyEdited(true);
                  }}
                  placeholder={config.provider === "ollama" ? "Not required for Ollama" : "sk-... or anthropic key"}
                  className="w-full bg-[var(--terminal-bg)] text-xs text-foreground border border-border rounded px-3 py-2 pr-8 focus:outline-none focus:border-neon-cyan font-mono"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Base URL */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                <Globe className="w-3 h-3" /> Base URL
              </label>
              <input
                type="text"
                value={config.baseUrl}
                onChange={(e) => setConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="https://api.openai.com/v1"
                className="w-full bg-[var(--terminal-bg)] text-xs text-foreground border border-border rounded px-3 py-2 focus:outline-none focus:border-neon-cyan font-mono"
              />
            </div>

            {/* Model */}
            <div>
              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                <Bot className="w-3 h-3" /> Model
              </label>
              <input
                type="text"
                value={config.model}
                onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
                placeholder="gpt-4o, claude-sonnet-4-20250514, llama3..."
                className="w-full bg-[var(--terminal-bg)] text-xs text-foreground border border-border rounded px-3 py-2 focus:outline-none focus:border-neon-cyan font-mono"
              />
            </div>

            {/* Temperature & Max Tokens */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                  <Thermometer className="w-3 h-3" /> Temperature
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={config.temperature}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }))
                    }
                    className="flex-1 accent-neon-cyan h-1"
                  />
                  <span className="text-xs text-foreground font-mono w-8 text-right">
                    {config.temperature.toFixed(1)}
                  </span>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                  <Hash className="w-3 h-3" /> Max Tokens
                </label>
                <input
                  type="number"
                  value={config.maxTokens}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, maxTokens: parseInt(e.target.value, 10) || 4096 }))
                  }
                  min={256}
                  max={128000}
                  step={256}
                  className="w-full bg-[var(--terminal-bg)] text-xs text-foreground border border-border rounded px-3 py-2 focus:outline-none focus:border-neon-cyan font-mono"
                />
              </div>
            </div>
          </div>

          {/* Save Bar */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-[var(--terminal-header)]">
            <div className="flex items-center gap-2">
              {saveResult && (
                <span
                  className={`text-[10px] flex items-center gap-1 ${
                    saveResult === "Settings saved" ? "text-neon-green" : "text-neon-red"
                  }`}
                >
                  {saveResult === "Settings saved" && <Check className="w-3 h-3" />}
                  {saveResult}
                </span>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded text-[10px] font-medium bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 hover:bg-neon-cyan/20 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              Save Settings
            </button>
          </div>
        </div>

        {/* User Management Section */}
        <div className="border border-border rounded-lg bg-card overflow-hidden mt-6">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-[var(--terminal-header)]">
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-neon-green" />
              <span className="text-xs font-semibold">User Management</span>
              <span className="text-[10px] text-muted-foreground">({users.length})</span>
            </div>
            <button
              onClick={() => { setShowCreateUser(!showCreateUser); setUserError(null); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium bg-neon-green/10 text-neon-green border border-neon-green/30 hover:bg-neon-green/20 transition-colors"
            >
              <UserPlus className="w-3 h-3" />
              Add User
            </button>
          </div>

          {showCreateUser && (
            <div className="p-4 border-b border-border bg-[var(--terminal-bg)]/50 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Name</label>
                  <input
                    type="text"
                    value={newUser.name}
                    onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))}
                    placeholder="John Doe"
                    className="w-full bg-[var(--terminal-bg)] text-xs text-foreground border border-border rounded px-3 py-2 focus:outline-none focus:border-neon-cyan font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Email</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                    placeholder="user@example.com"
                    className="w-full bg-[var(--terminal-bg)] text-xs text-foreground border border-border rounded px-3 py-2 focus:outline-none focus:border-neon-cyan font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Password</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newUser.password}
                      onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                      placeholder="Min 6 characters"
                      className="w-full bg-[var(--terminal-bg)] text-xs text-foreground border border-border rounded px-3 py-2 pr-8 focus:outline-none focus:border-neon-cyan font-mono"
                    />
                    <button
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNewPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Role</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["admin", "viewer"] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setNewUser((p) => ({ ...p, role: r }))}
                        className={`text-[10px] px-3 py-2 rounded border transition-colors capitalize ${
                          newUser.role === r
                            ? "bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan"
                            : "bg-transparent border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {userError && (
                <p className="text-[10px] text-neon-red">{userError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowCreateUser(false); setUserError(null); }}
                  className="px-3 py-1.5 rounded text-[10px] text-muted-foreground border border-border hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateUser}
                  disabled={userSaving || !newUser.email || !newUser.name || !newUser.password}
                  className="flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-medium bg-neon-green/10 text-neon-green border border-neon-green/30 hover:bg-neon-green/20 transition-colors disabled:opacity-50"
                >
                  {userSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                  Create User
                </button>
              </div>
            </div>
          )}

          <div className="divide-y divide-border">
            {users.length === 0 ? (
              <div className="px-4 py-8 text-center text-[10px] text-muted-foreground">
                No users found
              </div>
            ) : (
              users.map((u) => (
                <div key={u.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-[var(--terminal-bg)]/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-neon-cyan uppercase">
                        {u.name?.charAt(0) || u.email.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs text-foreground font-medium">{u.name}</div>
                      <div className="text-[10px] text-muted-foreground">{u.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border ${
                      u.role === "admin"
                        ? "text-neon-purple border-neon-purple/30 bg-neon-purple/10"
                        : "text-muted-foreground border-border"
                    }`}>
                      <Shield className="w-2.5 h-2.5" />
                      {u.role}
                    </span>
                    <button
                      onClick={() => handleDeleteUser(u.id)}
                      className="p-1 rounded text-muted-foreground hover:text-neon-red hover:bg-neon-red/10 transition-colors"
                      title="Delete user"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
