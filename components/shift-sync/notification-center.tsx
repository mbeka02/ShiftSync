"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell, Check, Inbox } from "lucide-react";
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
  const [items, setItems] = useState(notifications);
  const [pending, startTransition] = useTransition();
  const unread = items.filter((item) => !item.read).length;

  function markRead(id: string) {
    startTransition(async () => {
      const result = await markNotificationReadAction(id);
      if (result.success) setItems((current) => current.map((item) => item.id === id ? { ...item, read: true } : item));
    });
  }

  return (
    <Popover>
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
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{item.message}</p>
                  <p className="mt-2 font-mono text-[9px] uppercase text-muted-foreground">{new Date(item.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                </div>
                {!item.read ? <Button size="icon-xs" variant="ghost" onClick={() => markRead(item.id)} disabled={pending} aria-label={`Mark ${item.title} as read`}><Check className="size-3" /></Button> : null}
              </div>
              {item.link ? <Link href={item.link} className="mt-2 inline-block text-xs font-semibold text-primary underline-offset-4 hover:underline">View details</Link> : null}
            </article>
          )) : (
            <div className="px-6 py-10 text-center"><Inbox className="mx-auto size-6 text-primary" /><p className="mt-3 text-sm font-semibold">No notifications</p><p className="mt-1 text-xs text-muted-foreground">Schedule and coverage updates will appear here.</p></div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
