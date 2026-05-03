import { readFileSync, writeFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const typesIndex = path.resolve(
  here,
  "..",
  "..",
  "api-zod",
  "src",
  "generated",
  "types",
  "index.ts",
);
const typesDir = path.dirname(typesIndex);
const apiFile = path.resolve(
  here,
  "..",
  "..",
  "api-zod",
  "src",
  "generated",
  "api.ts",
);

const apiSrc = readFileSync(apiFile, "utf8");
const zodNames = new Set();
for (const m of apiSrc.matchAll(/^export const (\w+)\s*=/gm)) {
  zodNames.add(m[1]);
}

const lines = readFileSync(typesIndex, "utf8").split("\n");
const kept = [];
for (const line of lines) {
  const m = line.match(/^export \* from "\.\/(\w+)";?$/);
  if (m) {
    const file = path.join(typesDir, m[1] + ".ts");
    try {
      const src = readFileSync(file, "utf8");
      const exports = [...src.matchAll(/^export (?:type|interface|const|enum) (\w+)/gm)].map(
        (x) => x[1],
      );
      if (exports.length > 0 && exports.every((n) => zodNames.has(n))) {
        continue;
      }
    } catch {}
  }
  kept.push(line);
}
writeFileSync(typesIndex, kept.join("\n"));
console.log("dedup-body-types: cleaned types/index.ts");
