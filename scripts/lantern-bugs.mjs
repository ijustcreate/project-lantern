import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".lantern", "bugs");
const [command = "list", argument, ...rest] = process.argv.slice(2);
const allowedStatuses = ["open", "assigned-to-codex", "in-progress", "ready-for-test", "verified", "closed"];
const milestones = {
  "received": { kind: "handoff", note: "Received in morning scan." },
  "work-started": { kind: "analysis", note: "Work started.", status: "in-progress" },
  "implementation-complete": { kind: "change", note: "Implementation complete." },
  "testing-started": { kind: "test", note: "Testing started." },
  "testing-finished": { kind: "test", note: "Testing finished." },
  "ready-for-human": { kind: "handoff", note: "Ready for human to mark fixed.", status: "ready-for-test" }
};

function changeStatus(bug, next, author = "Codex", note) {
  if (bug.status === next) return;
  const at = new Date().toISOString();
  bug.statusHistory ??= [];
  bug.statusHistory.push({ at, author, from: bug.status, to: next, ...(note ? { note } : {}) });
  bug.status = next;
  bug.updatedAt = at;
}

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
      agentWork: [],
      statusHistory: [{ at: now, author: "Codex", to: "open", note: "Report created" }]
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
  if (!bug || !allowedStatuses.includes(next)) {
    console.error("Usage: npm run bugs -- status BUG-0002 in-progress");
    process.exitCode = 1;
  } else {
    changeStatus(bug, next, "Codex", next === "assigned-to-codex" ? "Explicitly approved for a Codex fix." : undefined);
    await writeFile(path.join(root, bug.bugId, "catalog.json"), JSON.stringify(bug, null, 2));
    console.log(`${bug.bugId} is now ${next}.`);
  }
} else if (command === "milestone") {
  const bug = bugs.find((item) => item.bugId.toLowerCase() === (argument ?? "").toLowerCase());
  const milestone = milestones[rest[0]];
  if (!bug || !milestone) {
    console.error(`Usage: npm run bugs -- milestone BUG-0002 ${Object.keys(milestones).join("|")}`);
    process.exitCode = 1;
  } else {
    const at = new Date().toISOString();
    bug.agentWork ??= [];
    bug.agentWork.push({ at, author: "Codex", kind: milestone.kind, note: milestone.note });
    if (milestone.status) changeStatus(bug, milestone.status, "Codex", milestone.note);
    bug.updatedAt = at;
    await writeFile(path.join(root, bug.bugId, "catalog.json"), JSON.stringify(bug, null, 2));
    console.log(`Recorded “${milestone.note}” on ${bug.bugId}.`);
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
  console.error("Usage: npm run bugs -- [add \"Summary\" \"Details\" | list | show BUG-0002 | status BUG-0002 assigned-to-codex | milestone BUG-0002 received | work BUG-0002 proposal \"note\"]");
  process.exitCode = 1;
}
