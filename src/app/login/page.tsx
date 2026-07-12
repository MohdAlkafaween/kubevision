"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"loading" | "login" | "register">("loading");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/check")
      .then((r) => r.json())
      .then((data) => setMode(data.hasUsers ? "login" : "register"))
      .catch(() => setMode("login"));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password");
      setSubmitting(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setSubmitting(false);
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Account created but login failed. Try logging in.");
        setMode("login");
        setSubmitting(false);
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Registration failed");
      setSubmitting(false);
    }
  };

  if (mode === "loading") {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 text-neon-cyan animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center bg-background relative overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "radial-gradient(circle, var(--neon-cyan) 1px, transparent 1px)",
        backgroundSize: "30px 30px",
      }} />

      <div className="relative w-full max-w-sm mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full bg-neon-green animate-pulse" />
            <span className="text-xl font-bold text-neon-green tracking-wider">
              KUBEVISION
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === "register"
              ? "Create your admin account to get started"
              : "Sign in to access your clusters"}
          </p>
        </div>

        {/* Form card */}
        <div className="bg-[var(--terminal-bg)] border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--terminal-header)] border-b border-border">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-neon-red/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-neon-amber/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-neon-green/60" />
            </div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider ml-2">
              {mode === "register" ? "Initial Setup" : "Authentication"}
            </span>
            {mode === "register" && (
              <ShieldCheck className="w-3 h-3 text-neon-cyan ml-auto" />
            )}
          </div>

          <form
            onSubmit={mode === "register" ? handleRegister : handleLogin}
            className="p-5 space-y-4"
          >
            {mode === "register" && (
              <div>
                <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder="Admin"
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-neon-cyan transition-colors placeholder:text-muted-foreground/40"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="admin@example.com"
                className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-neon-cyan transition-colors placeholder:text-muted-foreground/40"
              />
            </div>

            <div>
              <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  placeholder="••••••••"
                  minLength={6}
                  className="w-full bg-background border border-border rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-neon-cyan transition-colors placeholder:text-muted-foreground/40 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === "register" && (
                <p className="text-[9px] text-muted-foreground/60 mt-1">
                  Minimum 6 characters
                </p>
              )}
            </div>

            {error && (
              <div className="bg-neon-red/5 border border-neon-red/20 rounded px-3 py-2">
                <p className="text-xs text-neon-red">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan rounded px-4 py-2.5 text-sm font-medium hover:bg-neon-cyan/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {mode === "register" ? "Creating account..." : "Signing in..."}
                </>
              ) : mode === "register" ? (
                "Create Admin Account"
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[9px] text-muted-foreground/40 mt-6">
          KubeVision &mdash; Kubernetes Cluster Monitor & Visualizer
        </p>
      </div>
    </div>
  );
}
