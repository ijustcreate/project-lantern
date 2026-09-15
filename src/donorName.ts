import type { BoardPanel, Donor } from "./types";

export function sortPanelDonors(donors: Donor[], panel: Pick<BoardPanel, "donorSort" | "donorIds">): Donor[] {
  const mode = panel.donorSort ?? "manual";
  return [...donors].sort((a, b) => {
    if (mode === "manual") return panel.donorIds ? panel.donorIds.indexOf(a.id) - panel.donorIds.indexOf(b.id) : 0;
    const comparison = donorSortKey(a, mode).localeCompare(donorSortKey(b, mode), undefined, { sensitivity: "base" })
      || donorDisplayName(a).localeCompare(donorDisplayName(b), undefined, { sensitivity: "base" });
    return mode.endsWith("-desc") ? -comparison : comparison;
  });
}

export function donorDisplayName(donor: Donor): string {
  const legacyPeople = !donor.firstName && !donor.lastName ? parseLegacyPeople(donor.name) : [];
  if (!donor.firstName && !donor.lastName && !legacyPeople.length && !donor.people?.length) return donor.name;
  const names = [{ firstName: donor.firstName ?? "", middleName: donor.middleName, lastName: donor.lastName ?? "" }, ...(donor.people ?? legacyPeople)]
    .map((name) => [name.firstName, name.middleName, name.lastName].filter(Boolean).join(" ").trim())
    .filter(Boolean);
  return names.join(` ${donor.multiDonorJoiner ?? "and"} `) || donor.name;
}

export function hydrateDonorNameFields(donor: Donor): Pick<Donor, "firstName" | "middleName" | "lastName" | "people" | "multiDonorJoiner"> {
  if (donor.firstName || donor.lastName || donor.people?.length) {
    return {
      firstName: donor.firstName,
      middleName: donor.middleName,
      lastName: donor.lastName,
      people: donor.people,
      multiDonorJoiner: donor.multiDonorJoiner
    };
  }
  const legacyPeople = parseLegacyPeople(donor.name);
  if (legacyPeople.length) {
    return {
      firstName: legacyPeople[0].firstName,
      middleName: legacyPeople[0].middleName,
      lastName: legacyPeople[0].lastName,
      people: legacyPeople.slice(1),
      multiDonorJoiner: /\s*&\s*/.test(donor.name) ? "&" : "and"
    };
  }
  const words = donor.name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return { firstName: words.slice(0, -1).join(" "), lastName: words[words.length - 1] };
  }
  return {};
}

function parseLegacyPeople(value: string): Array<{ firstName: string; middleName?: string; lastName: string }> {
  const parts = value.split(/\s*(?:&|\band\b)\s*/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    const compact = value.match(/^([A-Z][a-z]+)and([A-Z][a-z]+)\s+(.+)$/);
    if (compact) return [{ firstName: compact[1], lastName: compact[3] }, { firstName: compact[2], lastName: compact[3] }];
    return [];
  }
  const lastName = parts[parts.length - 1].split(/\s+/).pop() ?? "";
  return parts.map((part) => ({ firstName: part.replace(new RegExp(`\\s+${lastName}$`), "").trim(), lastName }));
}

export function donorSortKey(donor: Donor, sort: "first-name" | "last-name" | "first-name-desc" | "last-name-desc"): string {
  const fields = hydrateDonorNameFields(donor);
  const names = [
    { firstName: fields.firstName ?? "", lastName: fields.lastName ?? "" },
    ...(fields.people ?? []).map((person) => ({ firstName: person.firstName, lastName: person.lastName }))
  ].filter((name) => name.firstName || name.lastName);
  if (!names.length) return donor.name.trim().toLocaleLowerCase();
  return names
    .map((name) => (sort.startsWith("first-name") ? name.firstName : name.lastName).trim())
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase() || donor.name.trim().toLocaleLowerCase();
}
