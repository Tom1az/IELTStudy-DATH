// PostToolUse hook: run Prettier on a backend file right after Claude edits it.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const file = JSON.parse(input).tool_input?.file_path ?? "";
  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const prettier = path.join(root, "backend/node_modules/.bin/prettier");

  const isBackendSource = file.startsWith(path.join(root, "backend/"));
  const isFormattable = /\.(ts|js|mjs|json|ya?ml|md)$/.test(file);
  const isGenerated = /node_modules|src\/prisma\/schema\.(d\.ts|json)$/.test(file);

  if (isBackendSource && isFormattable && !isGenerated && existsSync(prettier)) {
    spawnSync(prettier, ["--write", file], { cwd: path.join(root, "backend"), stdio: "ignore" });
  }
});
