import { describe, expect, it } from "vitest";

import { matchTicketLines, type MatchableListItem } from "@/lib/server/shopping-matching";
import type { TicketLine } from "@/lib/server/mistral-ticket";

function line(overrides: Partial<TicketLine>): TicketLine {
  return { name: "", quantity: 1, unitPrice: null, lineTotal: null, ean: null, ...overrides };
}

function item(overrides: Partial<MatchableListItem>): MatchableListItem {
  return {
    id: overrides.id ?? "item-1",
    label: "",
    productName: null,
    productBrand: null,
    productEan: null,
    ...overrides,
  };
}

describe("matchTicketLines", () => {
  it("matches on exact EAN regardless of how different the names look", () => {
    const lines = [line({ name: "ART 88213 QSO RALL", ean: "7790398100118" })];
    const items = [item({ id: "it-1", label: "Queso rallado La Paulina 40g", productEan: "7790398100118" })];

    const [proposal] = matchTicketLines(lines, items);
    expect(proposal.itemId).toBe("it-1");
    expect(proposal.score).toBe(1);
  });

  it("falls back to token overlap against the label when there's no EAN", () => {
    const lines = [line({ name: "LECHE SANCOR ENT 1L" })];
    const items = [item({ id: "it-1", label: "Leche Sancor Entera 1L" })];

    const [proposal] = matchTicketLines(lines, items);
    expect(proposal.itemId).toBe("it-1");
    expect(proposal.score).toBeGreaterThanOrEqual(0.35);
  });

  it("also matches against the product name/brand, not just the item label", () => {
    const lines = [line({ name: "QUESO CREMOSO SANCOR" })];
    const items = [
      item({
        id: "it-1",
        label: "Verdulería: tomates", // free-text label, unrelated
        productName: "Queso Cremoso",
        productBrand: "SANCOR",
      }),
    ];

    const [proposal] = matchTicketLines(lines, items);
    expect(proposal.itemId).toBe("it-1");
  });

  it("leaves a line unmatched when nothing clears the threshold", () => {
    const lines = [line({ name: "DETERGENTE MAGISTRAL" })];
    const items = [item({ id: "it-1", label: "Yerba mate Playadito" })];

    const [proposal] = matchTicketLines(lines, items);
    expect(proposal.itemId).toBeNull();
    expect(proposal.score).toBe(0);
  });

  it("never assigns the same item to two different lines (greedy, one-to-one)", () => {
    const lines = [
      line({ name: "LECHE SANCOR ENTERA 1L" }),
      line({ name: "LECHE SANCOR ENTERA 1L" }),
    ];
    const items = [item({ id: "it-1", label: "Leche Sancor Entera 1L" })];

    const proposals = matchTicketLines(lines, items);
    const matchedCount = proposals.filter((p) => p.itemId === "it-1").length;
    expect(matchedCount).toBe(1);
    expect(proposals.some((p) => p.itemId === null)).toBe(true);
  });

  it("prefers the higher-scoring pair when a line could match two items", () => {
    const lines = [line({ name: "LECHE SANCOR ENTERA DESCREMADA 1L" })];
    const items = [
      item({ id: "exact", label: "Leche Sancor Entera Descremada 1L" }),
      item({ id: "partial", label: "Leche" }),
    ];

    const [proposal] = matchTicketLines(lines, items);
    expect(proposal.itemId).toBe("exact");
  });

  it("returns one proposal per line, in order, even when the ticket has no items", () => {
    expect(matchTicketLines([], [item({ id: "it-1", label: "Algo" })])).toEqual([]);
  });
});
