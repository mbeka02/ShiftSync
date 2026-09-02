import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/server/auth/session";

export default async function Home() {
  const actor = await getAuthenticatedUser(new Headers(await headers()));
  redirect(actor ? "/schedule" : "/login");
}
