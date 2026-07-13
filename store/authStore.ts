"use client";

import { create } from "zustand";
import type {
  Organization,
  OrgContextResponse,
  SessionUser,
} from "@/lib/orgTypes";

export interface AuthState {
  user: SessionUser | null;
  organization: Organization | null;
  orgUsers: OrgContextResponse["users"];
  accessibleOuIds: string[];
  memberships: OrgContextResponse["memberships"];
  isOrgAdmin: boolean;
  loading: boolean;
  checked: boolean;
  error: string | null;
  activeOuId: string | null;

  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setActiveOu: (ouId: string | null) => void;
  refreshOrg: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  organization: null,
  orgUsers: [],
  accessibleOuIds: [],
  memberships: [],
  isOrgAdmin: false,
  loading: false,
  checked: false,
  error: null,
  activeOuId: null,

  hydrate: async () => {
    if (get().checked) return;
    set({ loading: true, error: null });
    try {
      const meRes = await fetch("/api/auth/me", { credentials: "include" });
      if (!meRes.ok) {
        set({ user: null, checked: true, loading: false });
        return;
      }
      const me = (await meRes.json()) as { user: SessionUser };
      const orgRes = await fetch("/api/org", { credentials: "include" });
      if (!orgRes.ok) {
        set({ user: me.user, checked: true, loading: false });
        return;
      }
      const orgCtx = (await orgRes.json()) as OrgContextResponse;
      set({
        user: me.user,
        organization: orgCtx.organization,
        orgUsers: orgCtx.users,
        accessibleOuIds: orgCtx.accessibleOuIds,
        memberships: orgCtx.memberships,
        isOrgAdmin: orgCtx.isOrgAdmin,
        activeOuId: orgCtx.accessibleOuIds[0] ?? null,
        checked: true,
        loading: false,
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Auth check failed",
        checked: true,
        loading: false,
      });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        set({ loading: false, error: data.error ?? "Login failed" });
        return false;
      }
      set({ checked: false });
      await get().hydrate();
      set({ loading: false });
      return true;
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : "Login failed",
      });
      return false;
    }
  },

  logout: async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    set({
      user: null,
      organization: null,
      orgUsers: [],
      accessibleOuIds: [],
      memberships: [],
      isOrgAdmin: false,
      activeOuId: null,
      checked: true,
    });
  },

  setActiveOu: (ouId) => set({ activeOuId: ouId }),

  refreshOrg: async () => {
    const res = await fetch("/api/org", { credentials: "include" });
    if (!res.ok) return;
    const orgCtx = (await res.json()) as OrgContextResponse;
    set({
      organization: orgCtx.organization,
      orgUsers: orgCtx.users,
      accessibleOuIds: orgCtx.accessibleOuIds,
      memberships: orgCtx.memberships,
      isOrgAdmin: orgCtx.isOrgAdmin,
    });
  },
}));
