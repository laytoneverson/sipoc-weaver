"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  side?: "right" | "left";
}

export function Sheet({ open, onOpenChange, children, side = "right" }: SheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          "fixed top-0 z-50 flex h-full w-full max-w-xl flex-col border-[var(--border)] bg-[var(--card)] shadow-2xl transition-transform duration-300",
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          open
            ? "translate-x-0"
            : side === "right"
              ? "translate-x-full"
              : "-translate-x-full",
        )}
      >
        {children}
      </div>
    </>
  );
}

export function SheetHeader({
  className,
  onClose,
  children,
}: {
  className?: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function SheetTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold", className)} {...props} />;
}

export function SheetBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex-1 overflow-y-auto px-5 py-4", className)} {...props} />
  );
}
