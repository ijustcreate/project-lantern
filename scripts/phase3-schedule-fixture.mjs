import assert from "node:assert/strict";
import {
  createPhase3DemoSchedule,
  migratePhase3Schedules,
  phase3DemoRange,
  PHASE3_CONTENT_VERSION
} from "../src/phase3Schedule.ts";

const legacyPortrait = {
  id: "schedule-portrait-board",
  name: "Toy Soldier Brigade · Welcome Gallery",
  target: "display-1",
  boardId: "board-toy-soldier-portrait",
  contentType: "board",
  days: [0, 3, 4, 5, 6],
  recurrence: "weekly",
  startTime: "07:00",
  endTime: "18:00",
  color: "#1675a8",
  active: true
};
const customizedLandscape = {
  id: "schedule-landscape-board",
  name: "Director’s custom afternoon rotation",
  target: "display-2",
  boardId: "board-toy-soldier-landscape",
  contentType: "board",
  days: [2, 4],
  recurrence: "weekly",
  startTime: "13:15",
  endTime: "16:45",
  color: "#224466",
  active: true
};
const customEntry = {
  id: "schedule-curator-special",
  name: "Curator special",
  target: "display-1",
  boardId: "board-toy-soldier-portrait",
  contentType: "board",
  days: [6],
  recurrence: "weekly",
  startTime: "11:00",
  endTime: "11:30",
  color: "#123456",
  active: true
};

const reference = new Date(2026, 7, 6, 12);
const expectedRange = { startDate: "2026-07-30", endDate: "2026-09-05" };
assert.deepEqual(phase3DemoRange(reference), expectedRange);

const seeded = createPhase3DemoSchedule(reference);
assert.equal(seeded.length, 20);
assert.equal(seeded.filter((entry) => entry.target === "display-1").length, 10);
assert.equal(seeded.filter((entry) => entry.target === "display-2").length, 10);
assert.ok(seeded.every((entry) => entry.scheduleDate === expectedRange.startDate && entry.scheduleEndDate === expectedRange.endDate));
assert.ok(seeded.some((entry) => entry.announcementId === "art-center-countdown"));
assert.ok(seeded.some((entry) => entry.announcementId === "art-center-open"));

const firstPass = migratePhase3Schedules([legacyPortrait, customizedLandscape, customEntry], 5, reference);
assert.equal(firstPass.find((entry) => entry.id === legacyPortrait.id)?.active, false, "exact legacy seed should be archived");
assert.deepEqual(firstPass.find((entry) => entry.id === customizedLandscape.id), customizedLandscape, "customized legacy ID must be preserved");
assert.deepEqual(firstPass.find((entry) => entry.id === customEntry.id), customEntry, "user-created schedule must be preserved");
assert.equal(firstPass.filter((entry) => entry.id.startsWith("phase3-demo-")).length, 20);

const secondPass = migratePhase3Schedules(firstPass, PHASE3_CONTENT_VERSION, reference);
assert.deepEqual(secondPass, firstPass, "v6 normalization must not reseed or rewrite saved schedules");
assert.equal(new Set(secondPass.map((entry) => entry.id)).size, secondPass.length, "migration must not duplicate IDs");

console.log(JSON.stringify({
  seededEntries: seeded.length,
  range: expectedRange,
  exactLegacyArchived: true,
  customizedLegacyPreserved: true,
  secondPassStable: true
}, null, 2));
