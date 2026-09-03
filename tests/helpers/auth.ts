import { randomUUID } from "node:crypto";
import { parseSetCookieHeader } from "better-auth/cookies";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { roles, staffProfiles, userProfiles, userRoles, type RoleCode } from "@/server/db/schema";

type ProfileData = {
  firstName?: string;
  lastName?: string;
  desiredWeeklyHours?: number;
  primaryTimezone?: string;
};

export async function createTestUser(roleCode: RoleCode, profile: ProfileData = {}) {
  const nonce = randomUUID();
  const firstName = profile.firstName ?? "Test";
  const lastName = profile.lastName ?? "User";
  const email = `test-${nonce}@shiftsync.local`;
  const response = await auth.api.signUpEmail({
    body: { email, password: `Test-${nonce}!aA9`, name: `${firstName} ${lastName}` },
    returnHeaders: true,
  });

  const userId = response.response.user.id;
  const cookieMap = parseSetCookieHeader(response.headers.get("set-cookie") ?? "");
  const headers = new Headers({
    cookie: Array.from(cookieMap.entries()).map(([name, value]) => `${name}=${value.value}`).join("; "),
  });

  await db.transaction(async (tx) => {
    await tx.insert(userProfiles).values({
      userId,
      firstName,
      lastName,
    });

    const [role] = await tx.insert(roles)
      .values({ code: roleCode, name: roleCode[0].toUpperCase() + roleCode.slice(1) })
      .onConflictDoUpdate({ target: roles.code, set: { name: roleCode[0].toUpperCase() + roleCode.slice(1) } })
      .returning({ id: roles.id });
    await tx.insert(userRoles).values({ userId, roleId: role.id });

    if (roleCode === "staff") {
      await tx.insert(staffProfiles).values({
        userId,
        desiredWeeklyHours: profile.desiredWeeklyHours ?? 0,
        primaryTimezone: profile.primaryTimezone ?? "UTC",
        employmentStartDate: new Date().toISOString().slice(0, 10),
      });
    }
  });

  return { headers, userId, email };
}
