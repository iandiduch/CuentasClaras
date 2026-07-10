import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { computeAccountBalances } from "@/lib/server/account-balance";
import { db } from "@/lib/server/db";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { accounts } from "@/lib/server/schema";

export const runtime = "nodejs";

const ACCOUNT_TYPES = ["cash", "bank", "wallet", "credit_card", "debit_card", "other"] as const;

const createAccountSchema = z.object({
  name: z.string().trim().min(2).max(60),
  accountType: z.enum(ACCOUNT_TYPES).default("other"),
  currency: z.string().trim().length(3).default("ARS"),
  openingBalance: z.coerce.number().default(0),
});

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      accountType: accounts.accountType,
      currency: accounts.currency,
      isActive: accounts.isActive,
      openingBalance: accounts.openingBalance,
    })
    .from(accounts)
    .where(eq(accounts.userId, user.id))
    .orderBy(asc(accounts.name));

  const balances = await computeAccountBalances(user.id, new Date());

  return Response.json({
    accounts: rows.map((row) => ({
      ...row,
      openingBalance: Number(row.openingBalance),
      currentBalance: balances.get(row.id) ?? Number(row.openingBalance),
    })),
  });
}

export async function POST(request: Request) {
  const payload = parseOrRespond(createAccountSchema, await request.json());
  if (payload instanceof Response) return payload;

  const user = await requireUser();
  if (user instanceof Response) return user;

  const now = new Date();

  const [account] = await db
    .insert(accounts)
    .values({
      userId: user.id,
      name: payload.name,
      accountType: payload.accountType,
      currency: payload.currency.toUpperCase(),
      isActive: true,
      openingBalance: payload.openingBalance.toFixed(2),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [accounts.userId, accounts.name],
    })
    .returning({
      id: accounts.id,
      name: accounts.name,
      accountType: accounts.accountType,
      currency: accounts.currency,
      isActive: accounts.isActive,
      openingBalance: accounts.openingBalance,
    });

  if (!account) {
    return Response.json({ error: "Ya existe una cuenta con ese nombre" }, { status: 409 });
  }

  return Response.json(
    {
      account: {
        ...account,
        openingBalance: Number(account.openingBalance),
        currentBalance: Number(account.openingBalance),
      },
    },
    { status: 201 }
  );
}
