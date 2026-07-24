import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const target = path.resolve("src", "changelog.json");
const [command, title, summary, ...options] = process.argv.slice(2);
if (command !== "add" || !title || !summary) {
  console.error('Usage: npm run changelog -- add "Title" "Why and what changed" --areas="Dashboard,Camera" --files="src/App.tsx" --tests="npm run build"');
  process.exit(1);
}
const value = (name) => options.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? "";
const entries = JSON.parse(await readFile(target, "utf8"));
const next = Math.max(0, ...entries.map((entry) => Number(entry.id.match(/\d+/)?.[0] ?? 0))) + 1;
entries.unshift({
  id: `DEV-${String(next).padStart(4, "0")}`,
  title,
  summary,
  author: value("author") || "Codex",
  createdAt: new Date().toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
  areas: value("areas").split(",").map((item) => item.trim()).filter(Boolean),
  files: value("files").split(",").map((item) => item.trim()).filter(Boolean),
  tests: value("tests") || "Not recorded"
});
await writeFile(target, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`Added ${entries[0].id}: ${title}`);
