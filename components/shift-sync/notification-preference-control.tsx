"use client";

import { useState, useTransition } from "react";
import { MailCheck, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { updateNotificationPreferenceAction } from "@/app/(dashboard)/preferences-actions";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { NotificationMode } from "@/server/db/schema";

export function NotificationPreferenceControl({ initialMode }: { initialMode: NotificationMode }) {
  const [mode, setMode] = useState(initialMode);
  const [pending, startTransition] = useTransition();
  const emailEnabled = mode === "in_app_and_email";

  function change(checked: boolean) {
    const previous = mode;
    const next: NotificationMode = checked ? "in_app_and_email" : "in_app_only";
    setMode(next);
    startTransition(async () => {
      const result = await updateNotificationPreferenceAction(next);
      if (!result.success) {
        setMode(previous);
        toast.error("Delivery preference was not saved.");
        return;
      }
      toast.success(checked ? "Email copies enabled." : "Notifications will stay in ShiftSync.");
    });
  }

  return <Popover>
    <PopoverTrigger aria-label="Notification delivery settings" className="grid size-11 place-items-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-[var(--surface-subtle)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <Settings2 className="size-4" />
    </PopoverTrigger>
    <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-0">
      <PopoverHeader className="border-b px-4 py-3">
        <PopoverTitle className="font-heading text-base tracking-[0.08em]">Delivery settings</PopoverTitle>
        <PopoverDescription>Choose whether operational notifications also create a simulated email.</PopoverDescription>
      </PopoverHeader>
      <label className="flex min-h-20 cursor-pointer items-center justify-between gap-4 px-4 py-4">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-sm font-semibold"><MailCheck className="size-4 text-primary" />Email copies</span>
          <span className="mt-1 block text-xs leading-5 text-muted-foreground">In-app notifications are always kept as the source of truth.</span>
        </span>
        <Switch checked={emailEnabled} onCheckedChange={change} disabled={pending} aria-label="Send simulated email copies" />
      </label>
      <p className="border-t bg-[var(--surface-subtle)] px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
        {emailEnabled ? "In app + simulated email" : "In app only"}
      </p>
    </PopoverContent>
  </Popover>;
}
