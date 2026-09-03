"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "@/hooks/use-realtime";

const INVALIDATION_EVENTS = [
  "assignment.assigned",
  "assignment.at-risk",
  "coverage.open",
  "coverage.pending_target",
  "coverage.accepted_by_target",
  "coverage.claimed",
  "coverage.approved",
  "coverage.rejected",
  "coverage.cancelled",
  "coverage.expired",
  "emergency-coverage.assigned",
  "notification.created",
  "onduty.clock_in",
  "onduty.clock_out",
  "schedule.published",
  "schedule.unpublished",
  "shift.created",
  "shift.updated",
] as const;

const POLL_INTERVAL_MS = 25_000;

export function RealtimeRefreshBridge({ channels }: { channels: string[] }) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  useRealtime(channels, INVALIDATION_EVENTS, refresh);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const interval = window.setInterval(refreshWhenVisible, POLL_INTERVAL_MS);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  return null;
}
