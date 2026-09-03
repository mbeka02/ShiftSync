"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AnalyticsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="px-4 py-6 sm:px-6 lg:px-8">
    <div className="border border-[var(--danger-fg)] bg-white px-6 py-12 text-center">
      <AlertTriangle className="mx-auto size-8 text-[var(--danger-fg)]" />
      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--danger-fg)]">Report unavailable</p>
      <h1 className="mt-1 font-heading text-3xl uppercase">The evidence ledger did not load</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Your schedule data was not changed. Retry the report, or return to the schedule workspace.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3"><Button onClick={reset}>Retry report</Button><Button variant="outline" render={<Link href="/schedule" />}>Return to schedule</Button></div>
    </div>
  </section>;
}
