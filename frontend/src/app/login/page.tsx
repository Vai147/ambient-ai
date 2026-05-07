"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import { setToken } from "@/lib/cookies";
import { useAuthStore } from "@/stores/auth";

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
    <main className="min-h-screen flex items-center justify-center px-4">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(oklch(96% 0.005 250 / 0.03) 1px, transparent 1px), linear-gradient(90deg, oklch(96% 0.005 250 / 0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg mb-4"
            style={{ background: "oklch(70% 0.18 195 / 0.15)", border: "1px solid oklch(70% 0.18 195 / 0.3)" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2v16M2 10h16" stroke="oklch(70% 0.18 195)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "oklch(96% 0.005 250)" }}>
            Ambient Scribe
          </h1>
          <p className="text-sm mt-1" style={{ color: "oklch(65% 0.01 250)" }}>
            Clinical documentation assistant
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-xl p-8"
          style={{
            background: "oklch(18% 0.01 250)",
            border: "1px solid oklch(96% 0.005 250 / 0.08)",
          }}
        >
          <h2 className="text-base font-medium mb-6" style={{ color: "oklch(96% 0.005 250)" }}>
            Sign in
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: "oklch(65% 0.01 250)" }}>
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
                style={{
                  background: "oklch(22% 0.015 250)",
                  border: "1px solid oklch(96% 0.005 250 / 0.1)",
                  color: "oklch(96% 0.005 250)",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "oklch(70% 0.18 195 / 0.6)";
                  e.target.style.boxShadow = "0 0 0 3px oklch(70% 0.18 195 / 0.1)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "oklch(96% 0.005 250 / 0.1)";
                  e.target.style.boxShadow = "none";
                }}
                placeholder="clinician@demo.test"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: "oklch(65% 0.01 250)" }}>
                Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
                style={{
                  background: "oklch(22% 0.015 250)",
                  border: "1px solid oklch(96% 0.005 250 / 0.1)",
                  color: "oklch(96% 0.005 250)",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "oklch(70% 0.18 195 / 0.6)";
                  e.target.style.boxShadow = "0 0 0 3px oklch(70% 0.18 195 / 0.1)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "oklch(96% 0.005 250 / 0.1)";
                  e.target.style.boxShadow = "none";
                }}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div
                className="text-xs px-3 py-2.5 rounded-lg"
                style={{
                  background: "oklch(55% 0.22 25 / 0.12)",
                  border: "1px solid oklch(55% 0.22 25 / 0.3)",
                  color: "oklch(75% 0.18 25)",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-medium transition-all mt-2"
              style={{
                background: loading ? "oklch(70% 0.18 195 / 0.5)" : "oklch(70% 0.18 195)",
                color: "oklch(14% 0.01 250)",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "oklch(45% 0.01 250)" }}>
          Demo: clinician@demo.test / password
        </p>
      </div>
    </main>
  );
}
