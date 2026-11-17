/**
 * JobApply runs in one of two modes, fixed when it is built:
 *
 * - **Local** (the default): one person, on their own computer. Data lives in
 *   the ./data folder and the server only answers this machine.
 * - **Hosted**: a public website many people use. Connected Supabase projects
 *   require sign-in and keep encrypted data per user. Until connected, the
 *   original browser-storage mode remains available. Set by building on Vercel
 *   or with JOBAPPLY_HOSTED=1 (see next.config.ts and auth/config.ts).
 */
export const HOSTED = process.env.NEXT_PUBLIC_HOSTED === "1";
