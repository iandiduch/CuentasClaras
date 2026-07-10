export type Direction = "income" | "expense";
export type CategoryDirection = "income" | "expense" | "both";
export type TransactionKind = "standard" | "transfer" | "adjustment";

export type CategoryDto = {
  id: string;
  name: string;
  direction: CategoryDirection;
  icon: string | null;
  colorHex: string | null;
  isSystem: boolean;
  includeInAnalysis: boolean;
  monthlyBudget: number | null;
};

export type CategoryBudgetDto = {
  categoryId: string;
  categoryName: string;
  icon: string | null;
  colorHex: string | null;
  monthlyBudget: number;
  spent: number;
  remaining: number;
  percent: number;
  spentSameDayLastMonth: number;
  deltaVsLastMonth: number;
  deltaPercent: number | null;
};

export type InstallmentPlanDto = {
  id: string;
  concept: string;
  totalAmount: number;
  installmentsCount: number;
  installmentAmount: number;
  startDate: string;
  currency: string;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string | null;
  accountName: string | null;
  counterpartyName: string | null;
  status: "active" | "cancelled";
  paidCount: number;
  remainingCount: number;
  nextDueDate: string | null;
  createdAt: string;
};

export type DebtDto = {
  id: string;
  direction: "receivable" | "payable";
  counterpartyName: string;
  amount: number;
  currency: string;
  concept: string | null;
  reminderDate: string | null;
  status: "open" | "settled" | "cancelled";
  settledAt: string | null;
  settledAccountName: string | null;
  createdAt: string;
};

export type RecurringExpenseDto = {
  id: string;
  name: string;
  expectedAmount: number | null;
  currency: string;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string | null;
  accountName: string | null;
  counterpartyName: string | null;
  dayOfMonth: number;
  isActive: boolean;
  thisMonthStatus: "not_due_yet" | "generated" | "awaiting_manual";
  thisMonthTransactionId: string | null;
  createdAt: string;
};

export type AccountDto = {
  id: string;
  name: string;
  accountType: string;
  currency: string;
  isActive: boolean;
  openingBalance: number;
  currentBalance: number;
};

export type TransactionDto = {
  id: string;
  direction: Direction;
  kind: TransactionKind;
  includeInTotals: boolean;
  amount: number;
  currency: string;
  occurredAt: string;
  concept: string | null;
  notes: string | null;
  status: "auto_confirmed" | "pending_review" | "manually_confirmed" | "rejected";
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColorHex: string | null;
  counterpartyName: string | null;
  accountId: string | null;
  accountName: string | null;
  transferAccountId: string | null;
  transferAccountName: string | null;
  documentId: string | null;
  createdAt: string;
};

export type MonthlyAnalyticsDto = {
  month: string;
  totals: {
    income: number;
    expense: number;
    balance: number;
    savingsRate: number;
  };
  expenseByCategory: Array<{
    category: string;
    total: number;
  }>;
  dailyCashflow: Array<{
    day: string;
    income: number;
    expense: number;
    balance: number;
  }>;
  monthTrend: Array<{
    month: string;
    income: number;
    expense: number;
    balance: number;
  }>;
  byAccount: Array<{
    accountId: string;
    accountName: string;
    income: number;
    expense: number;
    balance: number;
  }>;
};

export type NotificationDto = {
  id: string;
  type: "review_pending" | "debt_reminder" | "installment_due" | "recurring_due" | "budget_threshold";
  title: string;
  body: string | null;
  linkHref: string | null;
  relatedEntityId: string;
  isRead: boolean;
  createdAt: string;
};

export type ProjectionAnalyticsDto = {
  months: Array<{
    month: string;
    installmentsTotal: number;
    recurringTotal: number;
    total: number;
  }>;
  unknownRecurringCount: number;
};

export type ReviewDto = {
  id: string;
  reason:
    | "unknown_category"
    | "low_confidence"
    | "missing_fields"
    | "identity_ambiguous"
    | "counterparty_ambiguous"
    | "account_ambiguous"
    | "other"
    | "debt_match_ambiguous"
    | "recurring_match_ambiguous";
  status: "pending" | "in_progress" | "resolved" | "dismissed";
  details: Record<string, unknown>;
  createdAt: string;
  document: {
    id: string | null;
    originalFilename: string | null;
    mimeType: string | null;
  };
  transaction: {
    id: string;
    direction: Direction | null;
    amount: number | null;
    currency: string | null;
    occurredAt: string | null;
    concept: string | null;
    status: "auto_confirmed" | "pending_review" | "manually_confirmed" | "rejected" | null;
    categoryId: string | null;
    categoryName: string | null;
    counterpartyId: string | null;
    counterpartyName: string | null;
    accountId: string | null;
    accountName: string | null;
  } | null;
};

export type IngestJobDto = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "retry";
  forcedDirection: Direction | null;
  attempts: number;
  maxAttempts: number;
  priority: number;
  runAfter: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  document: {
    id: string;
    status: "uploaded" | "processing" | "processed" | "failed" | "archived";
    processingError: string | null;
    originalFilename: string | null;
    mimeType: string | null;
    uploadedAt: string | null;
  };
};
