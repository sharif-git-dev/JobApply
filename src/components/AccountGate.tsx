"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ACCOUNTS_ENABLED } from "@/lib/auth/config";
import { authClient } from "@/lib/auth/browser";
import { Button, Notice, Spinner } from "./ui";

export function AccountGate({ children }: { children: ReactNode }) {
  if (!ACCOUNTS_ENABLED) return children;
  return <SignedIn>{children}</SignedIn>;
}

function SignedIn({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const client = authClient();
    const expired = () => { setUserId(""); router.replace("/login"); };
    const check = async () => {
      const { data, error } = await client.auth.getUser();
      if (!alive) return;
      if (error || !data.user) { expired(); return; }
      setUserId(data.user.id);
      setEmail(data.user.email ?? "");
    };
    void check().catch(() => { if (alive) setError("Could not check your sign-in. Reload to try again."); });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === "SIGNED_OUT" || !session) expired();
      else if (event === "SIGNED_IN") {
        setUserId(session.user.id);
        setEmail(session.user.email ?? "");
      }
    });
    window.addEventListener("jobapply:signed-out", expired);
    return () => { alive = false; data.subscription.unsubscribe(); window.removeEventListener("jobapply:signed-out", expired); };
  }, [router]);

  async function signOut() {
    setBusy(true);
    const { error } = await authClient().auth.signOut({ scope: "local" });
    if (error) { setError("Could not sign out. Try again."); setBusy(false); return; }
    // A full navigation drops all loaded profile and application state from memory.
    window.location.replace("/login");
  }

  if (!userId) return <div className="mx-auto max-w-lg p-8">{error ? <Notice tone="danger">{error}</Notice> : <Spinner label="Checking your account…" />}</div>;
  return (
    <div key={userId}>
      <div className="flex items-center justify-end gap-3 border-b border-line bg-surface px-4 py-2 text-sm">
        <span className="min-w-0 truncate text-muted" title={email}>{email}</span>
        <Button size="sm" onClick={() => void signOut()} loading={busy}>Sign out</Button>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}
      {children}
    </div>
  );
}
