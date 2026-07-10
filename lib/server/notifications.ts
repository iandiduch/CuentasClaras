import { and, eq, gt, gte, inArray, isNotNull, lt, lte } from "drizzle-orm";

import { db } from "@/lib/server/db";
import {
  categories,
  debts,
  installmentPlans,
  notifications,
  recurringExpenses,
  reviewQueue,
  transactions,
} from "@/lib/server/schema";

const DUE_SOON_DAYS = 5;
const BUDGET_THRESHOLD_RATIO = 0.8;

type NotificationType =
  | "review_pending"
  | "debt_reminder"
  | "installment_due"
  | "recurring_due"
  | "budget_threshold";

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function upsertNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  linkHref: string;
  relatedEntityId: string;
  periodKey: string;
}) {
  const now = new Date();
  await db
    .insert(notifications)
    .values({
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: null,
      linkHref: params.linkHref,
      relatedEntityId: params.relatedEntityId,
      periodKey: params.periodKey,
      isRead: false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        notifications.userId,
        notifications.type,
        notifications.relatedEntityId,
        notifications.periodKey,
      ],
    });
}

export async function reconcileNotifications(userId: string): Promise<void> {
  const now = new Date();
  const dueSoonCutoff = new Date(now.getTime() + DUE_SOON_DAYS * 86400000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const pendingReviews = await db
    .select({ id: reviewQueue.id })
    .from(reviewQueue)
    .where(
      and(eq(reviewQueue.userId, userId), inArray(reviewQueue.status, ["pending", "in_progress"]))
    );

  for (const review of pendingReviews) {
    await upsertNotification({
      userId,
      type: "review_pending",
      title: "Tenes una revision pendiente",
      linkHref: "/reviews",
      relatedEntityId: review.id,
      periodKey: "",
    });
  }

  const dueDebts = await db
    .select({ id: debts.id, direction: debts.direction })
    .from(debts)
    .where(and(eq(debts.userId, userId), eq(debts.status, "open"), lte(debts.reminderDate, now)));

  for (const debt of dueDebts) {
    await upsertNotification({
      userId,
      type: "debt_reminder",
      title: debt.direction === "receivable" ? "Te deben un pago" : "Tenes un pago pendiente",
      linkHref: "/debts",
      relatedEntityId: debt.id,
      periodKey: "",
    });
  }

  const activePlans = await db
    .select({ id: installmentPlans.id, concept: installmentPlans.concept })
    .from(installmentPlans)
    .where(and(eq(installmentPlans.userId, userId), eq(installmentPlans.status, "active")));

  if (activePlans.length) {
    const planIds = activePlans.map((plan) => plan.id);
    const upcomingRows = await db
      .select({ installmentPlanId: transactions.installmentPlanId, occurredAt: transactions.occurredAt })
      .from(transactions)
      .where(
        and(
          inArray(transactions.installmentPlanId, planIds),
          gt(transactions.occurredAt, now),
          lte(transactions.occurredAt, dueSoonCutoff)
        )
      );

    const nextDueByPlan = new Map<string, Date>();
    for (const row of upcomingRows) {
      if (!row.installmentPlanId) continue;
      const existing = nextDueByPlan.get(row.installmentPlanId);
      if (!existing || row.occurredAt.getTime() < existing.getTime()) {
        nextDueByPlan.set(row.installmentPlanId, row.occurredAt);
      }
    }

    for (const plan of activePlans) {
      const dueDate = nextDueByPlan.get(plan.id);
      if (!dueDate) continue;

      await upsertNotification({
        userId,
        type: "installment_due",
        title: `Cuota de "${plan.concept}" vence pronto`,
        linkHref: "/installments",
        relatedEntityId: plan.id,
        periodKey: monthKey(dueDate),
      });
    }
  }

  const activeRecurring = await db
    .select({ id: recurringExpenses.id, name: recurringExpenses.name, dayOfMonth: recurringExpenses.dayOfMonth })
    .from(recurringExpenses)
    .where(and(eq(recurringExpenses.userId, userId), eq(recurringExpenses.isActive, true)));

  const daysInMonth = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400000);

  for (const recurring of activeRecurring) {
    const dueDate = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), Math.min(recurring.dayOfMonth, daysInMonth))
    );
    if (dueDate.getTime() > dueSoonCutoff.getTime()) continue;

    const [existing] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.recurringExpenseId, recurring.id),
          gte(transactions.occurredAt, monthStart),
          lt(transactions.occurredAt, monthEnd)
        )
      )
      .limit(1);

    if (existing) continue;

    await upsertNotification({
      userId,
      type: "recurring_due",
      title: `"${recurring.name}" vence pronto`,
      linkHref: "/recurring-expenses",
      relatedEntityId: recurring.id,
      periodKey: monthKey(monthStart),
    });
  }

  const budgetedCategories = await db
    .select({ id: categories.id, name: categories.name, monthlyBudget: categories.monthlyBudget })
    .from(categories)
    .where(and(eq(categories.userId, userId), isNotNull(categories.monthlyBudget)));

  if (budgetedCategories.length) {
    const spendingRows = await db
      .select({ categoryId: transactions.categoryId, amount: transactions.amount })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.direction, "expense"),
          eq(transactions.includeInTotals, true),
          gte(transactions.occurredAt, monthStart),
          lt(transactions.occurredAt, monthEnd)
        )
      );

    const spentByCategory = new Map<string, number>();
    for (const row of spendingRows) {
      if (!row.categoryId) continue;
      spentByCategory.set(row.categoryId, (spentByCategory.get(row.categoryId) ?? 0) + Number(row.amount));
    }

    for (const category of budgetedCategories) {
      const budget = Number(category.monthlyBudget);
      if (budget <= 0) continue;
      const spent = spentByCategory.get(category.id) ?? 0;
      const percent = spent / budget;
      if (percent < BUDGET_THRESHOLD_RATIO) continue;

      await upsertNotification({
        userId,
        type: "budget_threshold",
        title: `"${category.name}" cerca del limite (${Math.round(percent * 100)}%)`,
        linkHref: "/categories",
        relatedEntityId: category.id,
        periodKey: monthKey(monthStart),
      });
    }
  }
}
