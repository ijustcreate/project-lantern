import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".lantern", "bugs");
const [command = "list", argument, ...rest] = process.argv.slice(2);

async function all() {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return []; }
  const bugs = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try { return JSON.parse(await readFile(path.join(root, entry.name, "catalog.json"), "utf8")); } catch { return null; }
  }));
  return bugs.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const bugs = await all();
if (command === "add") {
  const summary = argument?.trim();
  const details = rest.join(" ").trim();
  if (!summary) {
    console.error('Usage: npm run bugs -- add "Summary" "Details"');
    process.exitCode = 1;
  } else {
    const highest = bugs.reduce((value, bug) => Math.max(value, Number(bug.bugId.match(/\d+/)?.[0] ?? 0)), 0);
    const bugId = `BUG-${String(highest + 1).padStart(4, "0")}`;
    const now = new Date().toISOString();
    const folder = path.join(root, bugId);
    const bug = {
      bugId,
      summary,
      details,
      fixTips: "",
      enteredBy: "Codex",
      tags: ["codex-request"],
      status: "open",
      createdAt: now,
      updatedAt: now,
      attachments: [],
      evidence: [],
      folder: path.join(".lantern", "bugs", bugId),
      agentWork: []
    };
    await import("node:fs/promises").then(({ mkdir }) => mkdir(folder, { recursive: true }));
    await writeFile(path.join(folder, "catalog.json"), JSON.stringify(bug, null, 2));
    console.log(`Added ${bugId}: ${summary}`);
  }
} else if (command === "list") {
  const status = argument?.replace(/^--status=/, "");
  const visible = status ? bugs.filter((bug) => bug.status === status) : bugs;
  if (!visible.length) console.log("No matching bugs.");
  else console.table(visible.map(({ bugId, status, summary, updatedAt }) => ({ bugId, status, summary, updatedAt })));
} else if (command === "show") {
  const bug = bugs.find((item) => item.bugId.toLowerCase() === (argument ?? "").toLowerCase());
  if (!bug) { console.error(`Bug not found: ${argument ?? "(missing id)"}`); process.exitCode = 1; }
  else console.log(JSON.stringify(bug, null, 2));
} else if (command === "status") {
  const bug = bugs.find((item) => item.bugId.toLowerCase() === (argument ?? "").toLowerCase());
  const next = rest[0];
  const allowed = ["open", "in-progress", "ready-for-test", "verified", "closed"];
  if (!bug || !allowed.includes(next)) {
    console.error("Usage: npm run bugs -- status BUG-0002 in-progress");
    process.exitCode = 1;
  } else {
    bug.status = next; bug.updatedAt = new Date().toISOString();
    await writeFile(path.join(root, bug.bugId, "catalog.json"), JSON.stringify(bug, null, 2));
    console.log(`${bug.bugId} is now ${next}.`);
  }
} else if (command === "work") {
  const bug = bugs.find((item) => item.bugId.toLowerCase() === (argument ?? "").toLowerCase());
  const [kind, ...noteParts] = rest;
  const allowed = ["analysis", "proposal", "change", "test", "handoff"];
  if (!bug || !allowed.includes(kind) || !noteParts.length) {
    console.error('Usage: npm run bugs -- work BUG-0002 proposal "Describe the proposed fix"');
    process.exitCode = 1;
  } else {
    bug.agentWork ??= [];
    bug.agentWork.push({ at: new Date().toISOString(), author: "Codex", kind, note: noteParts.join(" ") });
    bug.updatedAt = new Date().toISOString();
    await writeFile(path.join(root, bug.bugId, "catalog.json"), JSON.stringify(bug, null, 2));
    console.log(`Added ${kind} entry to ${bug.bugId}.`);
  }
} else {
  console.error("Usage: npm run bugs -- [add \"Summary\" \"Details\" | list | show BUG-0002 | status BUG-0002 in-progress | work BUG-0002 proposal \"note\"]");
  process.exitCode = 1;
}
