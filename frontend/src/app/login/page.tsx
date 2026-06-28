"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import { setToken } from "@/lib/cookies";
import { useAuthStore } from "@/stores/auth";
import { Logo } from "@/components/ui/Logo";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { access_token } = await authApi.login(email, password);
      setToken(access_token);
      const user = await authApi.me();
      login(access_token, user);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="flex items-center justify-center px-4"
      style={{
        minHeight: "100vh",
        position: "relative",
        backgroundImage:
          "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    >
      <div className="relative w-full" style={{ maxWidth: 384 }}>
        {/* Brand */}
        <div className="text-center" style={{ marginBottom: 40 }}>
          <div style={{ marginBottom: 16 }}>
            <Logo size="lg" withWordmark={false} />
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "var(--text-xl)",
              fontWeight: "var(--weight-semibold)",
              letterSpacing: "var(--tracking-tight)",
              color: "var(--text-primary)",
            }}
          >
            Ambient Scribe
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>
            Clinical documentation assistant
          </p>
        </div>

        {/* Card */}
        <Card padding={32}>
          <h2
            style={{
              margin: "0 0 24px",
              fontSize: "var(--text-base)",
              fontWeight: "var(--weight-medium)",
              color: "var(--text-primary)",
            }}
          >
            Sign in
          </h2>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={setEmail}
              placeholder="Email"
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
            />

            {error && (
              <div
                style={{
                  fontSize: "var(--text-xs)",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-lg)",
                  background: "var(--danger-tint-2)",
                  border: "1px solid var(--danger-border)",
                  color: "var(--danger-text)",
                }}
              >
                {error}
              </div>
            )}

            <Button type="submit" fullWidth loading={loading} style={{ marginTop: 8 }}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
