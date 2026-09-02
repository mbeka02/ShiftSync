import { eq } from "drizzle-orm";
import { auth } from "./index";
import { db } from "@/server/db";
import { roles, staffProfiles, userProfiles, userRoles } from "@/server/db/schema";

export async function getAuthenticatedUser(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;

  const [profile, roleRows, staffProfile] = await Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.userId, session.user.id)).limit(1)
      .then((rows) => rows[0]),
    db.select({ id: roles.id, code: roles.code, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, session.user.id)),
    db.select().from(staffProfiles).where(eq(staffProfiles.userId, session.user.id)).limit(1)
      .then((rows) => rows[0]),
  ]);

  return {
    session,
    profile: profile ?? null,
    roles: roleRows,
    staffProfile: staffProfile ?? null,
  };
}

export type EnrichedSession = NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;
