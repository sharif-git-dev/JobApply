import { SUPABASE_KEY, SUPABASE_URL } from "./config";
import { seal, unseal } from "./vault";

export class AccountError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export interface Account {
  id: string;
  token: string;
  version: number;
  state: Record<string, unknown>;
}

async function supabase(path: string, token: string, init?: RequestInit) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
}

/** Identity comes only from Supabase's verified access token, never from a request's user id or data. */
export async function loadAccount(request: Request): Promise<Account> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) throw new AccountError("Please sign in to continue.", 401);
  const token = header.slice(7);
  const identity = await supabase("/auth/v1/user", token);
  if (identity.status === 401 || identity.status === 403) throw new AccountError("Your session expired. Please sign in again.", 401);
  if (!identity.ok) throw new AccountError("Sign-in is temporarily unavailable. Try again.", 503);
  const user = await identity.json();
  if (typeof user.id !== "string") throw new AccountError("Please sign in again.", 401);
  const response = await supabase(`/rest/v1/account_state?user_id=eq.${encodeURIComponent(user.id)}&select=payload,version`, token);
  if (!response.ok) throw new AccountError("Account storage isn't ready. Please contact the app owner.", 503);
  const rows = await response.json();
  const row = rows[0];
  return { id: user.id, token, version: row?.version ?? 0, state: row ? unseal(row.payload, user.id) : {} };
}

/** Atomic compare-and-swap prevents two devices silently overwriting one another's changes. */
export async function saveAccount(account: Account, state: Record<string, unknown>) {
  const payload = seal(state, account.id);
  // Keep full-account exports and application lists below Vercel's response-size limit.
  if (Buffer.byteLength(payload) > 4_000_000) throw new AccountError("Your account is full. Download a backup and remove older applications.", 413);
  const response = await supabase("/rest/v1/rpc/save_account_state", account.token, {
    method: "POST",
    body: JSON.stringify({ expected_version: account.version, encrypted_payload: payload }),
  });
  if (!response.ok) throw new AccountError("Your changes could not be saved. Please try again.", 503);
  const version = await response.json();
  if (version === null) throw new AccountError("Your account changed in another tab or device. Reload to see the latest information, then try again.", 409);
  account.version = version;
  account.state = state;
}
