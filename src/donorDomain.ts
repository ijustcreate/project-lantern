import type { DonationRecord, Donor } from "./types";

export const BRIGADE_OPENING_PAYMENT_KEY = "brigade-opening-payment-v1" as const;
export const BRIGADE_OPENING_PAYMENT_NOTE = "Imported opening payment";

/**
 * Parses common pasted currency forms without throwing. Symbols, grouping
 * separators, and surrounding prose are ignored; negative values clamp to 0.
 */
export function parseCurrencyAmount(raw: string): number | undefined {
  const input = raw.trim();
  if (!input) return undefined;

  const negative = /[-−]/.test(input) || /^\s*\(.*\)\s*$/.test(input);
  const digits = input.replace(/[^0-9.]/g, "");
  if (!digits) return undefined;
  const [whole = "0", ...fractionParts] = digits.split(".");
  const normalized = fractionParts.length ? `${whole || "0"}.${fractionParts.join("")}` : whole;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return undefined;
  return negative ? 0 : Math.max(0, parsed);
}

export function makeBrigadeOpeningPayment(donor: Donor): DonationRecord {
  const date = donor.pledgeStartYear?.trim() || donor.since?.trim() || String(new Date().getFullYear());
  return {
    id: `${donor.id}-imported-opening-payment`,
    date,
    amount: Math.max(0, donor.pledgeAnnualAmount ?? 0),
    receiptNote: BRIGADE_OPENING_PAYMENT_NOTE,
    migrationKey: BRIGADE_OPENING_PAYMENT_KEY,
    note: BRIGADE_OPENING_PAYMENT_NOTE
  };
}

/** Ensures exactly one migration-authored opening payment while preserving real gifts. */
export function withBrigadeOpeningPayment(donor: Donor): Donor {
  const donations = donor.donations ?? [];
  const imported = donations.filter((gift) => (
    gift.migrationKey === BRIGADE_OPENING_PAYMENT_KEY
    || gift.id === `${donor.id}-imported-opening-payment`
    || gift.note?.trim() === BRIGADE_OPENING_PAYMENT_NOTE
  ));
  const retained = donations.filter((gift) => !imported.includes(gift));
  const openingPayment = imported[0]
    ? {
        ...imported[0],
        id: `${donor.id}-imported-opening-payment`,
        migrationKey: BRIGADE_OPENING_PAYMENT_KEY,
        note: BRIGADE_OPENING_PAYMENT_NOTE,
        receiptNote: imported[0].receiptNote || BRIGADE_OPENING_PAYMENT_NOTE,
        transactionReference: imported[0].transactionReference || undefined,
        checkNumber: imported[0].checkNumber || undefined
      }
    : makeBrigadeOpeningPayment(donor);
  return { ...donor, donations: [openingPayment, ...retained] };
}
