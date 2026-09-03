import { spawnSync } from "node:child_process";

function run(args: string[]) {
  const result = spawnSync("pnpm", args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["db:rebuild:development"]);
run(["exec", "playwright", "test"]);
