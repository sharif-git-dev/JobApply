/**
 * JobApply runs in one of two modes, fixed when it is built:
 *
 * - **Local** (the default): one person, on their own computer. Data lives in
 *   the ./data folder and the server only answers this machine.
 * - **Hosted**: a public website many people use. The server keeps nothing —
 *   each visitor's profile, applications and keys live in their own browser
 *   and travel with each request. Set by building on Vercel or with
 *   JOBAPPLY_HOSTED=1 (see next.config.ts).
 */
export const HOSTED = process.env.NEXT_PUBLIC_HOSTED === "1";
