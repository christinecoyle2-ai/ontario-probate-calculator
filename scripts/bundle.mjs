import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url);
for (const [src, out] of [
  ["rules/2026-10-25/ontario.json", "rules-bundle.js"],
  ["presets.json", "presets-bundle.js"],
]) {
  const data = JSON.parse(readFileSync(new URL(src, root), "utf8"));
  writeFileSync(new URL(out, root), `export default ${JSON.stringify(data, null, 2)};\n`);
  console.log("wrote", out);
}
