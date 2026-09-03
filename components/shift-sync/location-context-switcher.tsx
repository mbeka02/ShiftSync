"use client";

import { MapPin } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type LocationOption = { id: string; name: string; timezone: string };

export function LocationContextSwitcher({ locations, role, fallbackTimezone }: {
  locations: LocationOption[];
  role: string;
  fallbackTimezone: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canManage = role === "manager" || role === "admin";
  const selectedId = searchParams.get("location");
  const selected = locations.find((location) => location.id === selectedId) ?? locations[0];

  if (!canManage || locations.length < 2) {
    return <div className="min-w-0"><p className="flex items-center gap-2 truncate text-sm font-semibold"><MapPin className="size-4 text-primary" />{selected?.name ?? (canManage ? "No assigned location" : "My published schedule")}</p><p className="ml-6 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{selected?.timezone ?? fallbackTimezone}</p></div>;
  }

  return <label className="group flex min-w-0 items-center gap-2" aria-label="Active location">
    <MapPin className="size-4 shrink-0 text-primary" />
    <span className="min-w-0">
      <select
        value={selected?.id ?? ""}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("location", event.target.value);
          next.delete("shift");
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="block max-w-[15rem] cursor-pointer appearance-none border-0 bg-transparent pr-5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
      </select>
      <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{selected?.timezone}</span>
    </span>
  </label>;
}
