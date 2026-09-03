"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Bell, Check, Inbox } from "lucide-react";
import { markNotificationReadAction } from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  createdAt: string;
};

export function NotificationCenter({ notifications }: { notifications: NotificationItem[] }) {
  const [locallyRead, setLocallyRead] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const items = notifications.map((item) => locallyRead.has(item.id) ? { ...item, read: true } : item);
  const unread = items.filter((item) => !item.read).length;

  function markRead(id: string) {
    startTransition(async () => {
      const result = await markNotificationReadAction(id);
      if (result.success) setLocallyRead((current) => new Set(current).add(id));
    });
  }

  function detailLabel(type: string) {
    if (type === "ASSIGNMENT_AT_RISK") return "Review shift";
    if (type === "EMERGENCY_COVERAGE_ASSIGNED") return "Open shift";
    return "Open schedule";
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative grid size-11 place-items-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-[var(--surface-subtle)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <Bell className="size-4" />
        {unread ? <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center bg-[var(--color-signal-coral)] px-1 font-mono text-[9px] leading-4 text-white">{unread > 9 ? "9+" : unread}</span> : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0">
        <PopoverHeader className="border-b px-4 py-3">
          <PopoverTitle className="font-heading text-base tracking-[0.08em]">Inbox</PopoverTitle>
          <p className="text-xs text-muted-foreground">{unread ? `${unread} unread operational ${unread === 1 ? "update" : "updates"}` : "You’re caught up"}</p>
        </PopoverHeader>
        <div className="max-h-[26rem] overflow-y-auto">
          {items.length ? items.slice(0, 12).map((item) => (
            <article key={item.id} className={`border-b px-4 py-3 last:border-b-0 ${item.read ? "bg-white" : "border-l-2 border-l-primary bg-[var(--surface-subtle)]"}`}>
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold">{item.title}</p>
                <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{item.message}</p>
                <p className="mt-2 font-mono text-[9px] uppercase text-muted-foreground">{new Date(item.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-2.5">
                {item.link ? (
                  <Link
                    href={item.link}
                    onClick={() => {
                      if (!item.read) markRead(item.id);
                      setOpen(false);
                    }}
                    className="inline-flex min-h-7 items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {detailLabel(item.type)} <ArrowRight className="size-3" />
                  </Link>
                ) : null}
                {!item.read ? (
                  <Button size="xs" variant="ghost" className="px-0 text-muted-foreground hover:bg-transparent hover:text-foreground" onClick={() => markRead(item.id)} disabled={pending}>
                    <Check className="size-3" /> Mark as read
                  </Button>
                ) : <span className="inline-flex min-h-7 items-center gap-1 text-[11px] text-muted-foreground"><Check className="size-3" /> Read</span>}
              </div>
            </article>
          )) : (
            <div className="px-6 py-10 text-center"><Inbox className="mx-auto size-6 text-primary" /><p className="mt-3 text-sm font-semibold">No notifications</p><p className="mt-1 text-xs text-muted-foreground">Schedule and coverage updates will appear here.</p></div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
