import { HOSTED } from "../mode";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
// Keep the existing installation working until its owner connects the account service.
export const ACCOUNTS_ENABLED = HOSTED && Boolean(SUPABASE_URL && SUPABASE_KEY);
const provider = process.env.NEXT_PUBLIC_AUTH_OAUTH_PROVIDER;
export const OAUTH_PROVIDER = provider === "github" || provider === "google" ? provider : null;
export const EMAIL_AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_EMAIL_ENABLED !== "0";
