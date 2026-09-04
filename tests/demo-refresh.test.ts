import { describe, expect, it } from "vitest";

import { getDemoScheduleWindow, isDemoRefreshRequestAuthorized } from "@/server/demo/refresh";

describe("rolling demo refresh", () => {
  it("builds current and next schedule weeks from the invocation date", () => {
    expect(getDemoScheduleWindow(new Date("2026-10-14T23:30:00.000Z"))).toEqual({
      currentWeek: "2026-10-12",
      scenarioWeek: "2026-10-19",
    });
  });

  it("allows only an enabled production cron request with the configured bearer secret", () => {
    const base = {
      branch: "production",
      enabled: "true",
      cronSecret: "a-long-demo-refresh-secret",
    };

    expect(isDemoRefreshRequestAuthorized({
      ...base,
      authorization: "Bearer a-long-demo-refresh-secret",
    })).toBe(true);
    expect(isDemoRefreshRequestAuthorized({
      ...base,
      authorization: "Bearer the-wrong-secret",
    })).toBe(false);
    expect(isDemoRefreshRequestAuthorized({
      ...base,
      branch: "development",
      authorization: "Bearer a-long-demo-refresh-secret",
    })).toBe(false);
    expect(isDemoRefreshRequestAuthorized({
      ...base,
      enabled: "false",
      authorization: "Bearer a-long-demo-refresh-secret",
    })).toBe(false);
  });
});
