import assert from "node:assert/strict";
import { buildDonorNameGridLayout, splitDonorNameLines } from "../src/donorNameLayout.ts";

assert.deepEqual(splitDonorNameLines("Kevin and Sandy Huber"), ["Kevin", "and", "Sandy Huber"]);
assert.deepEqual(splitDonorNameLines("Denise & Rob Aitken"), ["Denise", "and", "Rob Aitken"]);
assert.deepEqual(splitDonorNameLines("Mary Bava"), ["Mary Bava"]);

const longName = "Patricia Alexandra Montgomery Brusher";
const longLines = splitDonorNameLines(longName);
assert.ok(longLines.length >= 2 && longLines.length <= 3);
assert.equal(longLines.join(" "), longName);

const gridLayout = buildDonorNameGridLayout([
  { name: "Kevin & Sandy Huber" },
  { name: "Duane Isetti" },
  { name: "Mary Bava" },
  { name: "Joanne Waters" }
], 2);
assert.equal(gridLayout.rowCount, 2);
assert.ok(gridLayout.rowUnits[0] > 2 * gridLayout.rowUnits[1] - .01, "a row with a three-line donor must receive more than twice the single-line row space");

console.log(JSON.stringify({
  conjunction: splitDonorNameLines("Kevin and Sandy Huber"),
  ampersand: splitDonorNameLines("Denise & Rob Aitken"),
  longName: longLines,
  fixedFontSize: true,
  rowUnits: gridLayout.rowUnits
}));
