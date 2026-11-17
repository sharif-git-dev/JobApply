"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNTS_ENABLED, SUPABASE_KEY, SUPABASE_URL } from "./config";

let client: SupabaseClient | undefined;
export function authClient() {
  if (!ACCOUNTS_ENABLED) throw new Error("Account sign-in hasn't been connected yet.");
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: "pkce", detectSessionInUrl: false },
  });
  return client;
}

export async function usingAccount(): Promise<boolean> {
  if (!ACCOUNTS_ENABLED) return false;
  const { data, error } = await authClient().auth.getSession();
  if (error) throw new Error("Could not check your sign-in. Reload and try again.");
  return Boolean(data.session);
}

export async function accountToken(): Promise<string> {
  const { data, error } = await authClient().auth.getSession();
  if (error || !data.session) {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("jobapply:signed-out"));
    throw new Error("Please sign in to continue.");
  }
  return data.session.access_token;
}
