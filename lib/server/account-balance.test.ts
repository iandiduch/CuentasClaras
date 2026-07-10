import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  computeAccountBalances,
  computeBalancesFromRows,
  sumBalances,
  type BalanceLedgerRow,
} from "@/lib/server/account-balance";
import { accounts, transactions, users } from "@/lib/server/schema";
import { withRollback } from "@/lib/server/testing/with-rollback";

function row(overrides: Partial<BalanceLedgerRow>): BalanceLedgerRow {
  return {
    accountId: null,
    transferAccountId: null,
    kind: "standard",
    direction: "expense",
    amount: 0,
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("computeBalancesFromRows (pure ledger arithmetic)", () => {
  it("adds income and subtracts expense for standard rows", () => {
    const balances = computeBalancesFromRows(
      new Map([["acc-1", 1000]]),
      [
        row({ accountId: "acc-1", direction: "income", amount: 500 }),
        row({ accountId: "acc-1", direction: "expense", amount: 200 }),
      ]
    );
    expect(balances.get("acc-1")).toBe(1300);
  });

  it("moves the full amount between accounts for a transfer, leaving the aggregate unchanged", () => {
    const balances = computeBalancesFromRows(
      new Map([
        ["from", 1000],
        ["to", 500],
      ]),
      [
        row({
          kind: "transfer",
          direction: "expense",
          accountId: "from",
          transferAccountId: "to",
          amount: 300,
        }),
      ]
    );
    expect(balances.get("from")).toBe(700);
    expect(balances.get("to")).toBe(800);
    expect(sumBalances(balances)).toBe(1500);
  });

  it("applies adjustment rows by direction just like standard rows", () => {
    const balances = computeBalancesFromRows(
      new Map([["acc-1", 1000]]),
      [row({ kind: "adjustment", direction: "income", accountId: "acc-1", amount: 50 })]
    );
    expect(balances.get("acc-1")).toBe(1050);
  });

  it("excludes rows at or after the cutoff", () => {
    const balances = computeBalancesFromRows(
      new Map([["acc-1", 1000]]),
      [
        row({
          accountId: "acc-1",
          direction: "income",
          amount: 500,
          occurredAt: new Date("2026-03-01T00:00:00Z"),
        }),
      ],
      new Date("2026-02-01T00:00:00Z")
    );
    expect(balances.get("acc-1")).toBe(1000);
  });

  it("does not mutate the openingBalances map passed in", () => {
    const opening = new Map([["acc-1", 1000]]);
    computeBalancesFromRows(opening, [row({ accountId: "acc-1", direction: "income", amount: 500 })]);
    expect(opening.get("acc-1")).toBe(1000);
  });
});

describe("computeAccountBalances (integration, real DB, rolled back)", () => {
  it("reflects a transfer on both the source and destination account, matching /api/v1/accounts", async () => {
    await withRollback(async (tx) => {
      const now = new Date();
      const [user] = await tx
        .insert(users)
        .values({
          username: `test_${randomUUID().slice(0, 8)}`,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: users.id });

      const [from] = await tx
        .insert(accounts)
        .values({
          userId: user!.id,
          name: "Origen",
          accountType: "cash",
          currency: "ARS",
          isActive: true,
          openingBalance: "1000.00",
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: accounts.id });

      const [to] = await tx
        .insert(accounts)
        .values({
          userId: user!.id,
          name: "Destino",
          accountType: "cash",
          currency: "ARS",
          isActive: true,
          openingBalance: "500.00",
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: accounts.id });

      await tx.insert(transactions).values({
        userId: user!.id,
        accountId: from!.id,
        transferAccountId: to!.id,
        direction: "expense",
        kind: "transfer",
        includeInTotals: false,
        amount: "300.00",
        currency: "ARS",
        occurredAt: now,
        status: "manually_confirmed",
        manualOverride: true,
        createdBy: "user",
        createdAt: now,
        updatedAt: now,
      });

      const balances = await computeAccountBalances(user!.id, undefined, tx);

      expect(balances.get(from!.id)).toBe(700);
      expect(balances.get(to!.id)).toBe(800);
    });
  });

  it("excludes transactions on or after the asOf cutoff", async () => {
    await withRollback(async (tx) => {
      const now = new Date();
      const future = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const [user] = await tx
        .insert(users)
        .values({ username: `test_${randomUUID().slice(0, 8)}`, createdAt: now, updatedAt: now })
        .returning({ id: users.id });

      const [account] = await tx
        .insert(accounts)
        .values({
          userId: user!.id,
          name: "Cuenta",
          accountType: "cash",
          currency: "ARS",
          isActive: true,
          openingBalance: "0.00",
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: accounts.id });

      await tx.insert(transactions).values({
        userId: user!.id,
        accountId: account!.id,
        direction: "income",
        kind: "standard",
        includeInTotals: true,
        amount: "999.00",
        currency: "ARS",
        occurredAt: future,
        status: "manually_confirmed",
        manualOverride: true,
        createdBy: "user",
        createdAt: now,
        updatedAt: now,
      });

      const balances = await computeAccountBalances(user!.id, now, tx);
      expect(balances.get(account!.id)).toBe(0);
    });
  });
});
