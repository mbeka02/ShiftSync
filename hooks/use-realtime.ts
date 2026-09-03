"use client";

import { useEffect, useRef, useState } from "react";
import Pusher from "pusher-js";

export type RealtimeStatus = "connecting" | "live" | "unavailable";

export function useRealtime(channelName: string | null, eventNames: readonly string[], onInvalidate: () => void) {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const seenEvents = useRef(new Set<string>());
  const configured = Boolean(channelName && process.env.NEXT_PUBLIC_PUSHER_APP_KEY && process.env.NEXT_PUBLIC_PUSHER_CLUSTER);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!channelName || !key || !cluster) {
      return;
    }

    const pusher = new Pusher(key, {
      cluster,
      forceTLS: true,
      channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" },
    });
    const channel = pusher.subscribe(channelName);
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = (payload: unknown) => {
      const eventId = typeof payload === "object" && payload !== null && "eventId" in payload
        ? String((payload as { eventId: unknown }).eventId)
        : null;
      if (eventId && seenEvents.current.has(eventId)) return;
      if (eventId) {
        seenEvents.current.add(eventId);
        if (seenEvents.current.size > 100) seenEvents.current.delete(seenEvents.current.values().next().value!);
      }
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(onInvalidate, 150);
    };

    pusher.connection.bind("connected", () => setStatus("live"));
    pusher.connection.bind("unavailable", () => setStatus("unavailable"));
    pusher.connection.bind("failed", () => setStatus("unavailable"));
    eventNames.forEach((eventName) => channel.bind(eventName, invalidate));

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      eventNames.forEach((eventName) => channel.unbind(eventName, invalidate));
      pusher.unsubscribe(channelName);
      pusher.disconnect();
    };
  }, [channelName, eventNames, onInvalidate]);

  return configured ? status : "unavailable";
}
