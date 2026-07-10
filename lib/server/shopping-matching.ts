import { normalizeText } from "@/lib/server/normalize";
import type { TicketLine } from "@/lib/server/mistral-ticket";

export type MatchableListItem = {
  id: string;
  label: string;
  productName: string | null;
  productBrand: string | null;
  productEan: string | null;
};

export type TicketMatchProposal = {
  lineIndex: number;
  itemId: string | null;
  score: number;
};

const MATCH_THRESHOLD = 0.35;

function tokenize(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 2)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  return intersection / (a.size + b.size - intersection);
}

function longTokenBonus(lineTokens: Set<string>, itemTokens: Set<string>): number {
  for (const token of lineTokens) {
    if (token.length >= 4 && itemTokens.has(token)) {
      return 0.2;
    }
  }
  return 0;
}

function scorePair(line: TicketLine, item: MatchableListItem): number {
  if (line.ean && item.productEan && line.ean === item.productEan) {
    return 1;
  }

  const lineTokens = tokenize(line.name);
  if (lineTokens.size === 0) {
    return 0;
  }

  const labelTokens = tokenize(item.label);
  const productTokens = tokenize(
    [item.productName ?? "", item.productBrand ?? ""].join(" ")
  );

  const labelScore = jaccard(lineTokens, labelTokens) + longTokenBonus(lineTokens, labelTokens);
  const productScore =
    productTokens.size > 0
      ? jaccard(lineTokens, productTokens) + longTokenBonus(lineTokens, productTokens)
      : 0;

  return Math.min(1, Math.max(labelScore, productScore));
}

// Greedy best-first assignment: each ticket line and each list item is used
// at most once. Deliberately modest — the user always confirms in the UI.
export function matchTicketLines(
  lines: TicketLine[],
  items: MatchableListItem[]
): TicketMatchProposal[] {
  const pairs: Array<{ lineIndex: number; itemId: string; score: number }> = [];

  lines.forEach((line, lineIndex) => {
    for (const item of items) {
      const score = scorePair(line, item);
      if (score >= MATCH_THRESHOLD) {
        pairs.push({ lineIndex, itemId: item.id, score });
      }
    }
  });

  pairs.sort((a, b) => b.score - a.score);

  const assignedLines = new Set<number>();
  const assignedItems = new Set<string>();
  const proposals = new Map<number, TicketMatchProposal>();

  for (const pair of pairs) {
    if (assignedLines.has(pair.lineIndex) || assignedItems.has(pair.itemId)) {
      continue;
    }
    assignedLines.add(pair.lineIndex);
    assignedItems.add(pair.itemId);
    proposals.set(pair.lineIndex, {
      lineIndex: pair.lineIndex,
      itemId: pair.itemId,
      score: Number(pair.score.toFixed(3)),
    });
  }

  return lines.map(
    (_, lineIndex) =>
      proposals.get(lineIndex) ?? { lineIndex, itemId: null, score: 0 }
  );
}
