export function splitDonorNameLines(rawName: string, maxLines = 3): string[] {
  const name = rawName.replace(/\s+/g, " ").trim();
  if (!name) return [""];

  const conjunction = /\s+(?:and|&)\s+/i.exec(name);
  if (conjunction?.index !== undefined) {
    const left = name.slice(0, conjunction.index).trim();
    const right = name.slice(conjunction.index + conjunction[0].length).trim();
    if (left && right) return [left, "and", right];
  }

  if (name.length <= 18 || maxLines <= 1) return [name];
  const words = name.split(" ");
  if (words.length === 1) return [name];

  const lineCount = Math.min(maxLines, name.length > 36 && words.length > 3 ? 3 : 2, words.length);
  const lines: string[] = [];
  let cursor = 0;
  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    const remainingWords = words.length - cursor;
    const remainingLines = lineCount - lineIndex;
    const take = lineIndex === lineCount - 1
      ? remainingWords
      : Math.max(1, Math.round(remainingWords / remainingLines));
    lines.push(words.slice(cursor, cursor + take).join(" "));
    cursor += take;
  }
  return lines.filter(Boolean);
}

export function buildDonorNameGridLayout(
  items: Array<{ name: string; hasSubtext?: boolean }>,
  columns: number,
  requestedRows?: number
) {
  const safeColumns = Math.max(1, Math.round(columns) || 1);
  const rowCount = Math.max(1, requestedRows ?? Math.ceil(items.length / safeColumns));
  const lineCounts = Array.from({ length: rowCount }, () => 1);
  const subtextRows = Array.from({ length: rowCount }, () => false);
  items.slice(0, rowCount * safeColumns).forEach((item, index) => {
    const row = Math.floor(index / safeColumns);
    lineCounts[row] = Math.max(lineCounts[row], splitDonorNameLines(item.name).length);
    subtextRows[row] ||= Boolean(item.hasSubtext);
  });
  const rowUnits = lineCounts.map((lineCount, row) => lineCount * .92 + (subtextRows[row] ? .72 : 0) + .48);
  return {
    rowCount,
    rowUnits,
    totalUnits: rowUnits.reduce((total, units) => total + units, 0)
  };
}
