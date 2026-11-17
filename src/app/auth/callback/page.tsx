"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/browser";
import { Button, Card, Field, Input, Notice, Spinner } from "@/components/ui";

let exchange: Promise<{ recovery: boolean }> | undefined;
// React Strict Mode may run effects twice. A one-time auth code must be exchanged only once.
function finishSignIn() {
  exchange ??= (async () => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (!code) throw new Error("This link is missing its sign-in code. Request a new email and open the link in the same browser.");
    const { error } = await authClient().auth.exchangeCodeForSession(code);
    if (error) throw new Error("This link expired or was opened in another browser. Request a new one from the sign-in page.");
    window.history.replaceState(null, "", "/auth/callback");
    return { recovery: url.searchParams.get("recovery") === "1" };
  })();
  return exchange;
}

export default function Callback() {
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void finishSignIn().then(({ recovery }) => {
      if (!alive) return;
      if (recovery) setRecovery(true); else window.location.replace("/");
    }).catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, []);

  return <main className="mx-auto max-w-md px-5 py-12"><Card className="p-6">
    {error && <Notice tone="danger">{error} <Link href="/login" className="underline">Go to sign in</Link></Notice>}
    {recovery ? <form className="flex flex-col gap-4" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError("");
      try {
        const { error } = await authClient().auth.updateUser({ password });
        if (error) throw error;
        // End other sessions as well; the user signs in afresh with the new password.
        await authClient().auth.signOut();
        window.location.replace("/login");
      } catch (err) { setError(err instanceof Error ? err.message : "Could not update your password."); }
      finally { setBusy(false); }
    }}>
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <Field label="New password" hint="At least 12 characters."><Input type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <Button type="submit" variant="primary" loading={busy}>Save password</Button>
    </form> : !error && <Spinner label="Confirming your sign-in…" />}
  </Card></main>;
}
