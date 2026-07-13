"use client";

import { useState } from "react";
import { Building2, Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/store/authStore";

export function LoginView() {
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">SIPOC Weaver</h1>
            <p className="text-xs text-[var(--muted-foreground)]">
              Sign in to access your organizational units
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="text-sm text-rose-400">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            <LogIn className="h-4 w-4" />
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--secondary)]/50 p-3 text-xs text-[var(--muted-foreground)]">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-[var(--foreground)]">
            <Lock className="h-3 w-3" />
            Demo accounts
          </div>
          <ul className="space-y-1">
            <li>admin@example.com / admin123 — all OUs</li>
            <li>editor@example.com / editor123 — enrollment & claims</li>
            <li>viewer@example.com / viewer123 — read-only sales & enrollment</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
