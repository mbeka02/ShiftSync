"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({ email: String(data.get("email")), password: String(data.get("password")) });
    if (result.error) {
      setError("We couldn’t sign you in. Check your email and password.");
      setPending(false);
      return;
    }
    router.replace("/schedule");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-describedby={error ? "login-error" : undefined}>
      <div className="space-y-2"><Label htmlFor="email">Work email</Label><div className="relative"><Mail aria-hidden className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input id="email" name="email" type="email" autoComplete="email" required className="h-11 pl-10" placeholder="you@coastaleats.com" /></div></div>
      <div className="space-y-2"><Label htmlFor="password">Password</Label><div className="relative"><LockKeyhole aria-hidden className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className="h-11 px-10" placeholder="Enter your password" /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-r-[var(--radius-sm)] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring">{showPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}</button></div></div>
      {error ? <p id="login-error" role="alert" className="border-l-2 border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-fg)]">{error}</p> : null}
      <Button type="submit" size="lg" className="w-full justify-between" disabled={pending}>{pending ? "Signing in…" : "Sign in to ShiftSync"}{!pending && <ArrowRight aria-hidden />}</Button>
      <p className="text-xs leading-5 text-muted-foreground">Access is managed by your Coastal Eats administrator.</p>
    </form>
  );
}
