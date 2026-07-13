"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Plus, Shield, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { OrganizationalUnit, OuRole, UserOuMembership } from "@/lib/orgTypes";
import { roleLabel } from "@/lib/orgUtils";
import { useAuthStore } from "@/store/authStore";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  isSystemAdmin: boolean;
  createdAt: string;
};

type Tab = "users" | "units" | "memberships";

export function AdminView() {
  const organization = useAuthStore((s) => s.organization);
  const orgUsers = useAuthStore((s) => s.orgUsers);
  const refreshOrg = useAuthStore((s) => s.refreshOrg);
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [units, setUnits] = useState<OrganizationalUnit[]>(
    organization?.organizationalUnits ?? [],
  );
  const [memberships, setMemberships] = useState<UserOuMembership[]>(
    organization?.memberships ?? [],
  );
  const [loading, setLoading] = useState(true);

  const reloadAdminData = useCallback(async () => {
    const [usersRes, unitsRes, membershipsRes] = await Promise.all([
      fetch("/api/admin/users", { credentials: "include" }),
      fetch("/api/admin/org/units", { credentials: "include" }),
      fetch("/api/org/memberships", { credentials: "include" }),
    ]);
    if (!usersRes.ok || !unitsRes.ok || !membershipsRes.ok) {
      throw new Error("Failed to load admin data");
    }
    const usersData = (await usersRes.json()) as { users: AdminUser[] };
    const unitsData = (await unitsRes.json()) as {
      organizationalUnits: OrganizationalUnit[];
    };
    const membershipsData = (await membershipsRes.json()) as {
      memberships: UserOuMembership[];
    };
    return {
      users: usersData.users,
      units: unitsData.organizationalUnits,
      memberships: membershipsData.memberships,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await reloadAdminData();
        if (cancelled) return;
        setUsers(data.users);
        setUnits(data.units);
        setMemberships(data.memberships);
      } catch {
        if (!cancelled) toast.error("Failed to load admin data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadAdminData]);

  const [newUser, setNewUser] = useState({
    email: "",
    name: "",
    password: "",
    isSystemAdmin: false,
  });
  const [newUnit, setNewUnit] = useState({ name: "", slug: "", description: "" });

  const saveMemberships = async () => {
    const res = await fetch("/api/admin/memberships", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberships }),
    });
    if (!res.ok) {
      toast.error("Failed to save memberships");
      return;
    }
    toast.success("Memberships saved");
    await refreshOrg();
  };

  const setMembershipRole = (userId: string, ouId: string, role: OuRole | "") => {
    setMemberships((prev) => {
      const rest = prev.filter((m) => !(m.userId === userId && m.ouId === ouId));
      if (!role) return rest;
      return [...rest, { userId, ouId, role }];
    });
  };

  const getRole = (userId: string, ouId: string): OuRole | "" => {
    return memberships.find((m) => m.userId === userId && m.ouId === ouId)?.role ?? "";
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">
        Loading admin console…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Shield className="h-5 w-5" />
          Administration
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Manage users, organizational units, and OU access for{" "}
          {organization?.name ?? "your organization"}.
        </p>
      </div>

      <div className="flex gap-2">
        {(
          [
            { id: "users" as const, label: "Users", icon: Users },
            { id: "units" as const, label: "Org units", icon: Building2 },
            { id: "memberships" as const, label: "Access", icon: Shield },
          ] as const
        ).map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={tab === t.id ? "default" : "outline"}
            onClick={() => setTab(t.id)}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "users" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Create user</h2>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={newUser.name}
                  onChange={(e) => setNewUser((s) => ({ ...s, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser((s) => ({ ...s, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser((s) => ({ ...s, password: e.target.value }))
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newUser.isSystemAdmin}
                  onChange={(e) =>
                    setNewUser((s) => ({ ...s, isSystemAdmin: e.target.checked }))
                  }
                />
                System admin
              </label>
              <Button
                onClick={async () => {
                  const res = await fetch("/api/admin/users", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(newUser),
                  });
                  if (!res.ok) {
                    toast.error("Failed to create user");
                    return;
                  }
                  toast.success("User created");
                  setNewUser({ email: "", name: "", password: "", isSystemAdmin: false });
                  const data = await reloadAdminData();
                  setUsers(data.users);
                  setUnits(data.units);
                  setMemberships(data.memberships);
                  await refreshOrg();
                }}
              >
                <Plus className="h-4 w-4" />
                Add user
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Users ({users.length})</h2>
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      {u.email}
                      {u.isSystemAdmin && " · system admin"}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Delete user"
                    onClick={async () => {
                      if (!confirm(`Delete ${u.name}?`)) return;
                      const res = await fetch(`/api/admin/users/${u.id}`, {
                        method: "DELETE",
                        credentials: "include",
                      });
                      if (!res.ok) {
                        const data = (await res.json()) as { error?: string };
                        toast.error(data.error ?? "Delete failed");
                        return;
                      }
                      toast.success("User deleted");
                      const data = await reloadAdminData();
                      setUsers(data.users);
                      setUnits(data.units);
                      setMemberships(data.memberships);
                      await refreshOrg();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "units" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Create organizational unit</h2>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={newUnit.name}
                  onChange={(e) => setNewUnit((s) => ({ ...s, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Slug</Label>
                <Input
                  value={newUnit.slug}
                  placeholder="e.g. claims-ops"
                  onChange={(e) => setNewUnit((s) => ({ ...s, slug: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input
                  value={newUnit.description}
                  onChange={(e) =>
                    setNewUnit((s) => ({ ...s, description: e.target.value }))
                  }
                />
              </div>
              <Button
                onClick={async () => {
                  const res = await fetch("/api/admin/org/units", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(newUnit),
                  });
                  if (!res.ok) {
                    toast.error("Failed to create unit");
                    return;
                  }
                  toast.success("OU created");
                  setNewUnit({ name: "", slug: "", description: "" });
                  const data = await reloadAdminData();
                  setUsers(data.users);
                  setUnits(data.units);
                  setMemberships(data.memberships);
                  await refreshOrg();
                }}
              >
                <Plus className="h-4 w-4" />
                Add OU
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">
              Organizational units ({units.length})
            </h2>
            <div className="space-y-2">
              {units.map((ou) => (
                <div
                  key={ou.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-medium">{ou.name}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      {ou.slug}
                      {ou.description ? ` · ${ou.description}` : ""}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      if (!confirm(`Delete ${ou.name}?`)) return;
                      const res = await fetch(`/api/admin/org/units/${ou.id}`, {
                        method: "DELETE",
                        credentials: "include",
                      });
                      if (!res.ok) {
                        toast.error("Failed to delete unit");
                        return;
                      }
                      toast.success("OU deleted");
                      const data = await reloadAdminData();
                      setUsers(data.users);
                      setUnits(data.units);
                      setMemberships(data.memberships);
                      await refreshOrg();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "memberships" && (
        <Card className="overflow-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">User × OU access matrix</h2>
            <Button size="sm" onClick={() => void saveMemberships()}>
              Save access
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                  <th className="py-2 pr-4">User</th>
                  {units.map((ou) => (
                    <th key={ou.id} className="px-2 py-2">
                      {ou.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orgUsers.map((user) => (
                  <tr key={user.id} className="border-b border-[var(--border)]/60">
                    <td className="py-2 pr-4 font-medium">{user.name}</td>
                    {units.map((ou) => (
                      <td key={ou.id} className="px-2 py-2">
                        <Select
                          className="h-8 text-xs"
                          value={getRole(user.id, ou.id)}
                          onChange={(e) =>
                            setMembershipRole(
                              user.id,
                              ou.id,
                              e.target.value as OuRole | "",
                            )
                          }
                        >
                          <option value="">—</option>
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="admin">Admin</option>
                        </Select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[var(--muted-foreground)]">
            {roleLabel("viewer")}: read-only · {roleLabel("editor")}: edit processes ·{" "}
            {roleLabel("admin")}: manage access
          </p>
        </Card>
      )}
    </div>
  );
}
