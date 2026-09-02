"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ScheduleError({ reset }: { error: Error; reset: () => void }) {
  return <div className="m-6 border border-[var(--danger-border)] bg-[var(--danger-bg)] p-6"><AlertTriangle className="size-6 text-[var(--danger-fg)]" /><h2 className="mt-3 font-heading text-2xl uppercase text-[var(--danger-fg)]">Schedule unavailable</h2><p className="mt-2 text-sm text-[var(--danger-fg)]">We couldn’t load this week. Your schedule data was not changed.</p><Button variant="outline" className="mt-5" onClick={reset}>Try again</Button></div>;
}
