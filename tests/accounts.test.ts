import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { seal, unseal } from "../src/lib/auth/vault";
import { AccountBackup } from "../src/lib/auth/backup";

const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";

test("account encryption authenticates both content and owner", () => {
  process.env.JOBAPPLY_ACCOUNT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const state = { profile: { fullName: "Private name" }, settings: { aiKeys: { groq: "private-provider-key" } } };
  const payload = seal(state, alice);
  assert(!payload.includes("Private name"));
  assert(!payload.includes("private-provider-key"));
  assert.deepEqual(unseal(payload, alice), state);
  assert.throws(() => unseal(payload, bob));
  const parts = payload.split(".");
  parts[3] = Buffer.from("tampered").toString("base64");
  assert.throws(() => unseal(parts.join("."), alice));
  process.env.JOBAPPLY_ACCOUNT_ENCRYPTION_KEY = "";
  assert.throws(() => seal(state, alice), /not configured/);
});

test("database enforces private accounts and rejects stale saves", async () => {
  const db = new PGlite();
  try {
    // Model Supabase's auth schema and JWT claims; run the production migration unchanged.
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      grant usage on schema auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users(id) values ('${alice}'), ('${bob}');
    `);
    await db.exec(await readFile("supabase/migrations/202611170001_accounts.sql", "utf8"));
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}';`);
    const save = async (version: number, text: string) => (await db.query<{ version: number }>(
      "select public.save_account_state($1, $2) as version", [version, text],
    )).rows[0].version;
    assert.equal(await save(0, "alice encrypted data"), 1);
    assert.equal(await save(0, "duplicate creation"), null);
    assert.equal(await save(1, "alice updated data"), 2);
    assert.equal(await save(1, "stale overwrite"), null);

    await db.exec(`set request.jwt.claim.sub = '${bob}';`);
    assert.deepEqual((await db.query("select * from public.account_state")).rows, []);
    await assert.rejects(db.query("insert into public.account_state(user_id, payload) values ($1, 'stolen')", [alice]), /row-level security/);
    assert.deepEqual((await db.query("update public.account_state set payload='stolen' where user_id=$1 returning *", [alice])).rows, []);
    assert.equal(await save(2, "cannot overwrite alice"), null);
    assert.equal(await save(0, "bob data"), 1);
    assert.equal((await db.query<{ user_id: string }>("select user_id from public.account_state")).rows[0].user_id, bob);
    await db.exec("set role anon; set request.jwt.claim.sub = '';");
    await assert.rejects(db.query("select * from public.account_state"), /permission denied/);
    await assert.rejects(db.query("select public.save_account_state(0, 'anonymous')"), /permission denied/);
  } finally { await db.close(); }
});

test("backup import rejects malformed applications and strips endpoint overrides", () => {
  const parsed = AccountBackup.parse({ app: "JobApply", profile: { fullName: "Owner" }, applications: [], settings: { aiBaseUrls: { custom: "http://private-host" } } });
  assert.equal(parsed.profile.fullName, "Owner");
  assert(!("aiBaseUrls" in parsed.settings));
  assert(!AccountBackup.safeParse({ app: "JobApply", applications: [{ id: "not-enough-fields" }] }).success);
});

test("server validates identity remotely and never accepts a browser's user id", async () => {
  process.env.NEXT_PUBLIC_HOSTED = "1";
  process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = "1";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://accounts.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-test-key";
  process.env.JOBAPPLY_ACCOUNT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const { loadAccount, saveAccount } = await import("../src/lib/auth/server");
  const { POST } = await import("../src/app/api/hosted/route");
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input); requests.push(url);
    if (url.endsWith("/auth/v1/user")) {
      const headers = init?.headers as Record<string, string>;
      return headers.Authorization === "Bearer valid-alice" ? Response.json({ id: alice }) : Response.json({ error: "invalid" }, { status: 401 });
    }
    if (url.includes("/rest/v1/account_state")) return Response.json([{ version: 2, payload: seal({ profile: { fullName: "Alice" } }, alice) }]);
    if (url.endsWith("/rpc/save_account_state")) return Response.json(null);
    throw new Error("Unexpected request");
  };
  try {
    await assert.rejects(loadAccount(new Request("http://app.test", { headers: { "x-user-id": alice } })), /sign in/);
    assert.equal(requests.length, 0);
    await assert.rejects(loadAccount(new Request("http://app.test", { headers: { authorization: "Bearer forged" } })), /session expired/);
    const account = await loadAccount(new Request("http://app.test", { headers: { authorization: "Bearer valid-alice", "x-user-id": bob } }));
    assert.equal(account.id, alice);
    assert.deepEqual(account.state, { profile: { fullName: "Alice" } });
    assert(requests.some((url) => url.includes(`user_id=eq.${alice}`)));
    const envelope = { path: "/api/profile", method: "GET", state: { profile: { fullName: "Injected Bob" } } };
    const anonymous = await POST(new Request("http://app.test/api/hosted", { method: "POST", body: JSON.stringify(envelope) }));
    assert.equal((await anonymous.json()).status, 401);
    const authenticated = await POST(new Request("http://app.test/api/hosted", { method: "POST", headers: { authorization: "Bearer valid-alice", "Content-Type": "application/json" }, body: JSON.stringify(envelope) }));
    const reply = await authenticated.json();
    assert.equal(reply.status, 200);
    assert.equal(reply.data.fullName, "Alice");
    assert.deepEqual(reply.state, {});
    await assert.rejects(saveAccount(account, { profile: {} }), /another tab or device/);
  } finally { globalThis.fetch = originalFetch; }
});
