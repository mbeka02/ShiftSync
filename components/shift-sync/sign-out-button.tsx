"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger className="flex min-h-11 w-full items-center gap-3 px-3 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white">
        <LogOut aria-hidden className="size-4" />Sign out
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-[var(--radius-md)] border border-border shadow-[var(--shadow-modal)]">
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out of ShiftSync?</AlertDialogTitle>
          <AlertDialogDescription>You’ll return to the login screen. Your schedule and account data will remain unchanged.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Stay signed in</AlertDialogCancel>
          <AlertDialogAction onClick={signOut} disabled={pending}>{pending ? "Signing out…" : "Sign out"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
