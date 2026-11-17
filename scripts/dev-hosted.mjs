// Runs the public-website build of JobApply on this machine, for trying it out
// before deploying. Same as `npm run dev`, but with hosted mode switched on
// (see src/lib/mode.ts). Works the same on Windows, macOS and Linux.
import { spawn } from "node:child_process";

const child = spawn("npx", ["next", "dev", "--hostname", "127.0.0.1", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, JOBAPPLY_HOSTED: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
