import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getAuthenticatedUser(new Headers(await headers()))) redirect("/schedule");
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(22rem,0.78fr)_1.22fr]">
      <section className="flex flex-col justify-between bg-[var(--color-deep-water)] px-6 py-8 text-white sm:px-10 lg:px-14 lg:py-12">
        <div><p className="font-heading text-2xl uppercase tracking-[0.08em]">ShiftSync</p><p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-white/60">Coastal Eats operations</p></div>
        <div className="my-12 max-w-lg"><p className="mb-4 font-mono text-xs uppercase tracking-[0.14em] text-[#9bd2ca]">Today’s service starts here</p><h1 className="font-heading text-5xl uppercase leading-[0.9] tracking-[-0.02em] sm:text-6xl">The right crew.<br />The right place.<br />Right on time.</h1><p className="mt-6 max-w-md text-sm leading-6 text-white/70">One calm view of published shifts across every Coastal Eats location.</p></div>
      </section>
      <section className="flex items-center bg-background px-6 py-12 sm:px-12 lg:px-20"><div className="w-full max-w-md"><p className="font-mono text-xs uppercase tracking-[0.14em] text-primary">Secure team access</p><h2 className="mt-3 font-heading text-4xl uppercase leading-none">Welcome back</h2><p className="mb-8 mt-3 text-sm leading-6 text-muted-foreground">Sign in to see the schedule and location details available to your role.</p><LoginForm /></div></section>
    </main>
  );
}
