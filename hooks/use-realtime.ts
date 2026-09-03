"use client";

import { useEffect, useRef, useState } from "react";
import Pusher from "pusher-js";

export type RealtimeStatus = "connecting" | "live" | "unavailable";

export function useRealtime(channelName: string | readonly string[] | null, eventNames: readonly string[], onInvalidate: () => void) {
  const channels = typeof channelName === "string" ? [channelName] : channelName ?? [];
  const channelKey = channels.join("|");
  const eventKey = eventNames.join("|");
  const configured = Boolean(channels.length && process.env.NEXT_PUBLIC_PUSHER_APP_KEY && process.env.NEXT_PUBLIC_PUSHER_CLUSTER);
  const [status, setStatus] = useState<RealtimeStatus>(() => configured ? "connecting" : "unavailable");
  const seenEvents = useRef(new Map<string, true>());

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    const activeChannels = channelKey ? channelKey.split("|") : [];
    const activeEvents = eventKey ? eventKey.split("|") : [];
    if (!activeChannels.length || !key || !cluster) {
      return;
    }

    const pusher = new Pusher(key, {
      cluster,
      forceTLS: true,
      channelAuthorization: { endpoint: "/api/pusher/auth", transport: "ajax" },
    });
    const subscriptions = activeChannels.map((name) => pusher.subscribe(name));
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let connectedOnce = false;
    const invalidate = (payload: unknown) => {
      const eventId = typeof payload === "object" && payload !== null && "eventId" in payload
        ? String((payload as { eventId: unknown }).eventId)
        : null;
      if (eventId && seenEvents.current.has(eventId)) {
        seenEvents.current.delete(eventId);
        seenEvents.current.set(eventId, true);
        return;
      }
      if (eventId) {
        seenEvents.current.set(eventId, true);
        if (seenEvents.current.size > 100) seenEvents.current.delete(seenEvents.current.keys().next().value!);
      }
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(onInvalidate, 150);
    };

    pusher.connection.bind("connected", () => {
      setStatus("live");
      if (connectedOnce) invalidate(null);
      connectedOnce = true;
    });
    pusher.connection.bind("unavailable", () => setStatus("unavailable"));
    pusher.connection.bind("failed", () => setStatus("unavailable"));
    subscriptions.forEach((channel) => activeEvents.forEach((eventName) => channel.bind(eventName, invalidate)));

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      subscriptions.forEach((channel) => activeEvents.forEach((eventName) => channel.unbind(eventName, invalidate)));
      activeChannels.forEach((name) => pusher.unsubscribe(name));
      pusher.disconnect();
    };
  }, [channelKey, eventKey, onInvalidate]);

  return configured ? status : "unavailable";
}
