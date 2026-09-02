import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";

function required(name: "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export const auth = betterAuth({
  appName: "ShiftSync",
  baseURL: required("BETTER_AUTH_URL"),
  secret: required("BETTER_AUTH_SECRET"),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    transaction: true,
  }),
  emailAndPassword: { enabled: true },
  plugins: [nextCookies()],
});
