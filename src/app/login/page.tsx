"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth/browser";
import { ACCOUNTS_ENABLED, EMAIL_AUTH_ENABLED, OAUTH_PROVIDER } from "@/lib/auth/config";
import { Button, Card, Field, Input, Notice } from "@/components/ui";

type Mode = "signin" | "signup" | "reset";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function changeMode(mode: Mode) { setMode(mode); setError(""); setMessage(""); setPassword(""); }

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const client = authClient();
      const callback = `${window.location.origin}/auth/callback`;
      if (mode === "signin") {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(error.message);
        window.location.replace("/");
      } else if (mode === "signup") {
        const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: callback } });
        if (error) throw new Error(error.message);
        if (data.session) window.location.replace("/");
        else { setPassword(""); setMessage("Check your email to confirm your account. Then return here to sign in. If you already have an account, use Sign in."); }
      } else {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${callback}?recovery=1` });
        if (error) throw new Error(error.message);
        setMessage("If that address can receive a reset email, a link is on its way. Open it in this browser to choose a new password.");
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Could not connect. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <Link href="/" className="mb-6 text-2xl font-semibold tracking-tight text-accent">JobApply</Link>
      <Card className="p-6">
        <h1 className="text-xl font-semibold">{mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}</h1>
        <p className="mb-5 mt-2 text-sm text-muted">Your profile and applications, saved privately and available on your devices.</p>
        {!ACCOUNTS_ENABLED ? <Notice>Account setup is being connected. <Link className="underline" href="/">Return to JobApply</Link>.</Notice> : (
          <>
            {OAUTH_PROVIDER && <Button className="mb-4 w-full" variant="primary" loading={busy} onClick={async () => {
              const provider = OAUTH_PROVIDER;
              if (!provider) return;
              setBusy(true); setError("");
              try {
                const { error } = await authClient().auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/auth/callback` } });
                if (error) throw error;
              } catch (err) { setError(err instanceof Error ? err.message : "Could not open sign-in."); setBusy(false); }
            }}>Continue with {OAUTH_PROVIDER === "github" ? "GitHub" : "Google"}</Button>}
            {!EMAIL_AUTH_ENABLED && error && <Notice tone="danger">{error}</Notice>}
            {EMAIL_AUTH_ENABLED && <>
            <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
              <Field label="Email"><Input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              {mode !== "reset" && <Field label="Password" hint={mode === "signup" ? "Use at least 12 characters." : undefined}><Input type="password" required minLength={mode === "signup" ? 12 : 1} maxLength={256} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>}
              {error && <Notice tone="danger">{error}</Notice>}
              {message && <Notice tone="success">{message}</Notice>}
              <Button type="submit" variant="primary" loading={busy}>{mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}</Button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => changeMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Create an account" : "Back to sign in"}</Button>
              {mode === "signin" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => changeMode("reset")}>Forgot password?</Button>}
            </div>
            </>}
            {!EMAIL_AUTH_ENABLED && !OAUTH_PROVIDER && <Notice>Sign-in is being configured. Please try again shortly.</Notice>}
          </>
        )}
      </Card>
    </main>
  );
}
