"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-[var(--radius-sm)] !border !border-[var(--border-strong)] !bg-[var(--surface-default)] !font-sans !text-[var(--text-strong)] !shadow-[var(--shadow-modal)]",
          title: "!font-semibold",
          description: "!text-[var(--text-muted)]",
          success: "!border-l-4 !border-l-[var(--success-fg)]",
          error: "!border-l-4 !border-l-[var(--danger-fg)]",
          warning: "!border-l-4 !border-l-[var(--warning-fg)]",
          actionButton: "!rounded-[var(--radius-sm)] !bg-primary !text-primary-foreground",
          cancelButton: "!rounded-[var(--radius-sm)] !bg-[var(--surface-subtle)] !text-[var(--text-default)]",
          closeButton: "!border-[var(--border-strong)] !bg-[var(--surface-default)] !text-[var(--text-muted)]",
        },
      }}
      {...props}
    />
  );
}
