"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ACCOUNTS_ENABLED } from "@/lib/auth/config";
import { authClient } from "@/lib/auth/browser";
import { Button, Notice, Spinner, buttonClass } from "./ui";

const AccountContext = createContext({ signedIn: false });
export const useAccount = () => useContext(AccountContext);

export function AccountGate({ children }: { children: ReactNode }) {
  if (!ACCOUNTS_ENABLED) return children;
  return <AccountSession>{children}</AccountSession>;
}

function AccountSession({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    const client = authClient();
    const expired = () => {
      setUserId(""); setEmail("");
      setError("Your session ended. Sign in again to access your account, or continue using the guest tools on this device.");
      void client.auth.signOut({ scope: "local" });
    };
    const check = async () => {
      const { data: session, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!alive) return;
      if (!session.session) { setReady(true); return; }
      const { data, error } = await client.auth.getUser();
      if (!alive) return;
      if (error || !data.user) { expired(); setReady(true); return; }
      setUserId(data.user.id); setEmail(data.user.email ?? ""); setReady(true);
    };
    void check().catch(() => { if (alive) setError("Could not check your sign-in. Reload to try again."); });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === "SIGNED_OUT") { setUserId(""); setEmail(""); setReady(true); }
      else if (event === "SIGNED_IN" && session) {
        setUserId(session.user.id); setEmail(session.user.email ?? ""); setError(""); setReady(true);
      }
    });
    window.addEventListener("jobapply:signed-out", expired);
    return () => { alive = false; data.subscription.unsubscribe(); window.removeEventListener("jobapply:signed-out", expired); };
  }, []);

  async function signOut() {
    setBusy(true);
    const { error } = await authClient().auth.signOut({ scope: "local" });
    if (error) { setError("Could not sign out. Try again."); setBusy(false); return; }
    // Drop all loaded account data and return to the public home page.
    window.location.replace("/");
  }

  if (!ready) return <div className="mx-auto max-w-lg p-8">{error ? <Notice tone="danger">{error}</Notice> : <Spinner label="Opening JobApply…" />}</div>;
  return (
    <AccountContext.Provider value={{ signedIn: Boolean(userId) }}>
      <div key={userId || "guest"}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2 text-sm md:pl-60">
          <span className="min-w-0 truncate text-muted">{userId ? email : "Guest · your information stays on this device"}</span>
          {userId ? <Button size="sm" onClick={() => void signOut()} loading={busy}>Sign out</Button> : <Link href="/login" className={buttonClass("primary", "sm")}>Sign in to sync your data</Link>}
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        {children}
      </div>
    </AccountContext.Provider>
  );
}
