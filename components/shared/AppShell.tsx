"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { LoginView } from "@/components/auth/LoginView";
import { AdminView } from "@/components/admin/AdminView";
import { FlowCanvas } from "@/components/canvas/FlowCanvas";
import { ConnectPicker } from "@/components/canvas/ConnectPicker";
import { SIPOCEditor } from "@/components/editor/SIPOCEditor";
import { LibraryView } from "@/components/library/LibraryView";
import { GapsView } from "@/components/gaps/GapsView";
import { ViewerView } from "@/components/viewer/ViewerView";
import { Navbar } from "@/components/shared/Navbar";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { useAuthStore } from "@/store/authStore";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useState } from "react";

function AppBody() {
  const user = useAuthStore((s) => s.user);
  const authChecked = useAuthStore((s) => s.checked);
  const authLoading = useAuthStore((s) => s.loading);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateWorkspace = useWorkspaceStore((s) => s.hydrate);
  const hydrated = useWorkspaceStore((s) => s.hydrated);
  const view = useWorkspaceStore((s) => s.view);
  const undo = useWorkspaceStore((s) => s.undo);
  const redo = useWorkspaceStore((s) => s.redo);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    void hydrateAuth();
  }, [hydrateAuth]);

  useEffect(() => {
    if (user && !hydrated) {
      hydrateWorkspace();
    }
  }, [user, hydrated, hydrateWorkspace]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        const t = e.target as HTMLElement;
        if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
        e.preventDefault();
        undo();
      }
      if (meta && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        const t = e.target as HTMLElement;
        if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  if (!authChecked || authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--background)] text-sm text-[var(--muted-foreground)]">
        Checking session…
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--background)] text-sm text-[var(--muted-foreground)]">
        Loading workspace…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <Navbar onOpenCommand={() => setCommandOpen(true)} />
      <main className="relative min-h-0 flex-1">
        {view === "map" && <FlowCanvas />}
        {view === "library" && <LibraryView />}
        {view === "gaps" && <GapsView />}
        {view === "viewer" && <ViewerView />}
        {view === "admin" && <AdminView />}
      </main>
      <SIPOCEditor />
      <ConnectPicker />
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <Toaster theme="system" richColors position="bottom-right" />
    </div>
  );
}

export function AppShell() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AppBody />
    </ThemeProvider>
  );
}
