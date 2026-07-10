import { relations, sql } from "drizzle-orm";
import {
  bigserial,
  bigint,
  boolean,
  char,
  customType,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

export const txnDirectionEnum = pgEnum("txn_direction", ["income", "expense"]);
export const transactionKindEnum = pgEnum("transaction_kind", [
  "standard",
  "transfer",
  "adjustment",
]);
export const txnStatusEnum = pgEnum("txn_status", [
  "auto_confirmed",
  "pending_review",
  "manually_confirmed",
  "rejected",
]);
export const categoryDirectionEnum = pgEnum("category_direction", [
  "income",
  "expense",
  "both",
]);
export const documentStatusEnum = pgEnum("document_status", [
  "uploaded",
  "processing",
  "processed",
  "failed",
  "archived",
]);
export const documentSourceEnum = pgEnum("document_source", [
  "api",
  "pwa_manual_upload",
  "email_forward",
  "other",
]);
export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "in_progress",
  "resolved",
  "dismissed",
]);
export const reviewReasonEnum = pgEnum("review_reason", [
  "unknown_category",
  "low_confidence",
  "missing_fields",
  "identity_ambiguous",
  "counterparty_ambiguous",
  "account_ambiguous",
  "other",
  "debt_match_ambiguous",
  "recurring_match_ambiguous",
]);
export const ruleMatchTypeEnum = pgEnum("rule_match_type", [
  "exact",
  "contains",
  "regex",
]);
export const identityKindEnum = pgEnum("identity_kind", [
  "person_name",
  "phone",
  "email",
  "tax_id",
  "bank_account",
  "alias",
  "cbu",
  "cvu",
  "other",
]);
export const ruleModeEnum = pgEnum("rule_mode", [
  "fixed_category",
  "always_review",
]);
export const ingestJobStatusEnum = pgEnum("ingest_job_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "retry",
]);
export const installmentPlanStatusEnum = pgEnum("installment_plan_status", [
  "active",
  "cancelled",
]);
export const debtDirectionEnum = pgEnum("debt_direction", ["receivable", "payable"]);
export const debtStatusEnum = pgEnum("debt_status", ["open", "settled", "cancelled"]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "review_pending",
  "debt_reminder",
  "installment_due",
  "recurring_due",
  "budget_threshold",
]);
export const ingestJobKindEnum = pgEnum("ingest_job_kind", [
  "document",
  "shopping_ticket",
]);
export const shoppingListStatusEnum = pgEnum("shopping_list_status", [
  "active",
  "closed",
]);
export const shoppingProductSourceEnum = pgEnum("shopping_product_source", [
  "catalog",
  "manual",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: citext("username").unique(),
  passwordHash: text("password_hash"),
  email: citext("email").unique(),
  fullName: text("full_name"),
  defaultCurrency: char("default_currency", { length: 3 }).notNull().default("ARS"),
  timezone: text("timezone").notNull().default("America/Argentina/Buenos_Aires"),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const userIdentities = pgTable(
  "user_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    identityType: identityKindEnum("identity_type").notNull(),
    identityValue: text("identity_value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    userIdentityUnique: uniqueIndex("user_identities_user_id_identity_type_normalized_value_key")
      .on(table.userId, table.identityType, table.normalizedValue),
  })
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    accountType: text("account_type").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    isActive: boolean("is_active").notNull(),
    openingBalance: numeric("opening_balance", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    userNameUnique: uniqueIndex("accounts_user_id_name_key").on(
      table.userId,
      table.name
    ),
  })
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    direction: categoryDirectionEnum("direction").notNull(),
    icon: text("icon"),
    colorHex: text("color_hex"),
    isSystem: boolean("is_system").notNull().default(false),
    includeInAnalysis: boolean("include_in_analysis").notNull().default(true),
    monthlyBudget: numeric("monthly_budget", { precision: 14, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    userNameDirectionUnique: uniqueIndex("categories_user_name_direction_key").on(
      table.userId,
      table.name,
      table.direction
    ),
  })
);

export const counterparties = pgTable(
  "counterparties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    userNormalizedUnique: uniqueIndex("counterparties_user_id_normalized_name_key").on(
      table.userId,
      table.normalizedName
    ),
  })
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: documentSourceEnum("source").notNull(),
    originalFilename: text("original_filename"),
    mimeType: text("mime_type").notNull(),
    fileExtension: text("file_extension"),
    storagePath: text("storage_path").notNull(),
    sha256: char("sha256", { length: 64 }),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull(),
    status: documentStatusEnum("status").notNull(),
    processingError: text("processing_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    userStoragePathUnique: uniqueIndex("documents_user_id_storage_path_key").on(
      table.userId,
      table.storagePath
    ),
    userShaUnique: uniqueIndex("documents_user_id_sha256_key").on(
      table.userId,
      table.sha256
    ),
  })
);

export const ingestJobs = pgTable("ingest_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  status: ingestJobStatusEnum("status").notNull(),
  kind: ingestJobKindEnum("kind").notNull().default("document"),
  payload: jsonb("payload"),
  forcedDirection: txnDirectionEnum("forced_direction"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  priority: smallint("priority").notNull().default(100),
  runAfter: timestamp("run_after", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  lastError: text("last_error"),
  workerId: text("worker_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const documentExtractions = pgTable("document_extractions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  extractor: text("extractor").notNull(),
  modelName: text("model_name"),
  promptVersion: text("prompt_version"),
  rawText: text("raw_text"),
  rawJson: jsonb("raw_json").notNull(),
  extractedAmount: numeric("extracted_amount", { precision: 14, scale: 2 }),
  extractedCurrency: char("extracted_currency", { length: 3 }),
  extractedOccurredAt: timestamp("extracted_occurred_at", { withTimezone: true }),
  extractedDirection: txnDirectionEnum("extracted_direction"),
  extractedCounterpartyName: text("extracted_counterparty_name"),
  extractedConcept: text("extracted_concept"),
  isUserSender: boolean("is_user_sender"),
  confidenceOverall: numeric("confidence_overall", { precision: 5, scale: 4 }),
  confidenceAmount: numeric("confidence_amount", { precision: 5, scale: 4 }),
  confidenceCounterparty: numeric("confidence_counterparty", {
    precision: 5,
    scale: 4,
  }),
  confidenceDirection: numeric("confidence_direction", {
    precision: 5,
    scale: 4,
  }),
  confidenceConcept: numeric("confidence_concept", { precision: 5, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const installmentPlans = pgTable("installment_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  concept: text("concept").notNull(),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
  installmentsCount: smallint("installments_count").notNull(),
  installmentAmount: numeric("installment_amount", { precision: 14, scale: 2 }).notNull(),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  accountId: uuid("account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  counterpartyId: uuid("counterparty_id").references(() => counterparties.id, {
    onDelete: "set null",
  }),
  status: installmentPlanStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const recurringExpenses = pgTable("recurring_expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  expectedAmount: numeric("expected_amount", { precision: 14, scale: 2 }),
  currency: char("currency", { length: 3 }).notNull(),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  accountId: uuid("account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  counterpartyId: uuid("counterparty_id").references(() => counterparties.id, {
    onDelete: "set null",
  }),
  dayOfMonth: smallint("day_of_month").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  accountId: uuid("account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  // direction convention by kind: standard = actual income/expense;
  // adjustment = whether the correction increases (income) or decreases
  // (expense) the account balance; transfer = always "expense" (outflow leg
  // from accountId — the inflow leg into transferAccountId is implicit,
  // there is no second row).
  direction: txnDirectionEnum("direction").notNull(),
  kind: transactionKindEnum("kind").notNull().default("standard"),
  includeInTotals: boolean("include_in_totals").notNull().default(true),
  transferAccountId: uuid("transfer_account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  counterpartyId: uuid("counterparty_id").references(() => counterparties.id, {
    onDelete: "set null",
  }),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  installmentPlanId: uuid("installment_plan_id").references(() => installmentPlans.id, {
    onDelete: "set null",
  }),
  installmentNumber: smallint("installment_number"),
  recurringExpenseId: uuid("recurring_expense_id").references(() => recurringExpenses.id, {
    onDelete: "set null",
  }),
  concept: text("concept"),
  notes: text("notes"),
  status: txnStatusEnum("status").notNull(),
  manualOverride: boolean("manual_override").notNull().default(false),
  extractionConfidence: numeric("extraction_confidence", {
    precision: 5,
    scale: 4,
  }),
  categorizationConfidence: numeric("categorization_confidence", {
    precision: 5,
    scale: 4,
  }),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const debts = pgTable("debts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  direction: debtDirectionEnum("direction").notNull(),
  counterpartyId: uuid("counterparty_id")
    .notNull()
    .references(() => counterparties.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  concept: text("concept"),
  reminderDate: timestamp("reminder_date", { withTimezone: true }),
  status: debtStatusEnum("status").notNull().default("open"),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  settledAccountId: uuid("settled_account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  settledTransactionId: uuid("settled_transaction_id").references(() => transactions.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    linkHref: text("link_href"),
    relatedEntityId: uuid("related_entity_id").notNull(),
    periodKey: text("period_key").notNull().default(""),
    isRead: boolean("is_read").notNull().default(false),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    dedupeUnique: uniqueIndex("notifications_dedupe_idx").on(
      table.userId,
      table.type,
      table.relatedEntityId,
      table.periodKey
    ),
  })
);

export const reviewQueue = pgTable("review_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  transactionId: uuid("transaction_id").references(() => transactions.id, {
    onDelete: "set null",
  }),
  reason: reviewReasonEnum("reason").notNull(),
  details: jsonb("details").notNull(),
  status: reviewStatusEnum("status").notNull(),
  resolvedBy: uuid("resolved_by").references(() => users.id, {
    onDelete: "set null",
  }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const categorizationRules = pgTable(
  "categorization_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    counterpartyId: uuid("counterparty_id").references(() => counterparties.id, {
      onDelete: "set null",
    }),
    counterpartyPattern: text("counterparty_pattern").notNull(),
    direction: txnDirectionEnum("direction").notNull(),
    mode: ruleModeEnum("mode").notNull().default("fixed_category"),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "restrict",
    }),
    matchType: ruleMatchTypeEnum("match_type").notNull().default("exact"),
    priority: smallint("priority").notNull().default(100),
    minConfidence: numeric("min_confidence", { precision: 5, scale: 4 })
      .notNull()
      .default("0.7000"),
    isActive: boolean("is_active").notNull().default(true),
    learnedFromReview: boolean("learned_from_review").notNull().default(true),
    hitsCount: integer("hits_count").notNull().default(0),
    lastMatchedAt: timestamp("last_matched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    userPatternDirectionMatchUnique: uniqueIndex(
      "categorization_rules_user_id_counterparty_pattern_direction_match_type_key"
    ).on(table.userId, table.counterpartyPattern, table.direction, table.matchType),
  })
);

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  action: text("action").notNull(),
  beforeData: jsonb("before_data"),
  afterData: jsonb("after_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const shoppingStores = pgTable(
  "shopping_stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    slug: text("slug"),
    counterpartyId: uuid("counterparty_id").references(() => counterparties.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    userNormalizedUnique: uniqueIndex("shopping_stores_user_id_normalized_name_key").on(
      table.userId,
      table.normalizedName
    ),
  })
);

export const shoppingProducts = pgTable(
  "shopping_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: shoppingProductSourceEnum("source").notNull(),
    externalId: text("external_id"),
    ean: text("ean"),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    brand: text("brand"),
    category: text("category"),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    userExternalUnique: uniqueIndex("shopping_products_user_id_external_id_key")
      .on(table.userId, table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
    userManualNameUnique: uniqueIndex("shopping_products_user_id_manual_name_key")
      .on(table.userId, table.normalizedName)
      .where(sql`${table.source} = 'manual'`),
  })
);

export const shoppingLists = pgTable("shopping_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: shoppingListStatusEnum("status").notNull().default("active"),
  storeId: uuid("store_id").references(() => shoppingStores.id, {
    onDelete: "set null",
  }),
  storeName: text("store_name"),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }),
  total: numeric("total", { precision: 14, scale: 2 }),
  currency: char("currency", { length: 3 }).notNull().default("ARS"),
  registeredTransactionId: uuid("registered_transaction_id").references(
    () => transactions.id,
    { onDelete: "set null" }
  ),
  ticketDocumentId: uuid("ticket_document_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const shoppingListItems = pgTable("shopping_list_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  listId: uuid("list_id")
    .notNull()
    .references(() => shoppingLists.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => shoppingProducts.id, { onDelete: "restrict" }),
  label: text("label").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
  refPrice: numeric("ref_price", { precision: 14, scale: 2 }),
  refStoreName: text("ref_store_name"),
  refStoreSlug: text("ref_store_slug"),
  refPricesJson: jsonb("ref_prices_json"),
  refCapturedAt: timestamp("ref_captured_at", { withTimezone: true }),
  checked: boolean("checked").notNull().default(false),
  paidUnitPrice: numeric("paid_unit_price", { precision: 14, scale: 2 }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const shoppingPriceSnapshots = pgTable(
  "shopping_price_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => shoppingProducts.id, { onDelete: "cascade" }),
    storeSlug: text("store_slug").notNull(),
    storeName: text("store_name").notNull(),
    price: numeric("price", { precision: 14, scale: 2 }).notNull(),
    listPrice: numeric("list_price", { precision: 14, scale: 2 }),
    promoLabel: text("promo_label"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    dedupeUnique: uniqueIndex("shopping_price_snapshots_dedupe_key").on(
      table.productId,
      table.storeSlug,
      table.recordedAt
    ),
  })
);

export const usersRelations = relations(users, ({ many }) => ({
  categories: many(categories),
  accounts: many(accounts),
  transactions: many(transactions),
  documents: many(documents),
  reviewQueue: many(reviewQueue),
  userIdentities: many(userIdentities),
  sessions: many(sessions),
  apiKeys: many(apiKeys),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
  transactions: many(transactions),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, {
    fields: [categories.userId],
    references: [users.id],
  }),
  transactions: many(transactions),
}));

export const counterpartiesRelations = relations(counterparties, ({ one, many }) => ({
  user: one(users, {
    fields: [counterparties.userId],
    references: [users.id],
  }),
  transactions: many(transactions),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, {
    fields: [documents.userId],
    references: [users.id],
  }),
  extractions: many(documentExtractions),
  reviewQueue: many(reviewQueue),
  transactions: many(transactions),
  ingestJobs: many(ingestJobs),
}));

export const ingestJobsRelations = relations(ingestJobs, ({ one }) => ({
  user: one(users, {
    fields: [ingestJobs.userId],
    references: [users.id],
  }),
  document: one(documents, {
    fields: [ingestJobs.documentId],
    references: [documents.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  counterparty: one(counterparties, {
    fields: [transactions.counterpartyId],
    references: [counterparties.id],
  }),
  document: one(documents, {
    fields: [transactions.documentId],
    references: [documents.id],
  }),
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  transferAccount: one(accounts, {
    fields: [transactions.transferAccountId],
    references: [accounts.id],
  }),
  installmentPlan: one(installmentPlans, {
    fields: [transactions.installmentPlanId],
    references: [installmentPlans.id],
  }),
  recurringExpense: one(recurringExpenses, {
    fields: [transactions.recurringExpenseId],
    references: [recurringExpenses.id],
  }),
}));

export const recurringExpensesRelations = relations(recurringExpenses, ({ one, many }) => ({
  user: one(users, {
    fields: [recurringExpenses.userId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [recurringExpenses.categoryId],
    references: [categories.id],
  }),
  account: one(accounts, {
    fields: [recurringExpenses.accountId],
    references: [accounts.id],
  }),
  counterparty: one(counterparties, {
    fields: [recurringExpenses.counterpartyId],
    references: [counterparties.id],
  }),
  transactions: many(transactions),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const debtsRelations = relations(debts, ({ one }) => ({
  user: one(users, {
    fields: [debts.userId],
    references: [users.id],
  }),
  counterparty: one(counterparties, {
    fields: [debts.counterpartyId],
    references: [counterparties.id],
  }),
  settledAccount: one(accounts, {
    fields: [debts.settledAccountId],
    references: [accounts.id],
  }),
  settledTransaction: one(transactions, {
    fields: [debts.settledTransactionId],
    references: [transactions.id],
  }),
}));

export const installmentPlansRelations = relations(installmentPlans, ({ one, many }) => ({
  user: one(users, {
    fields: [installmentPlans.userId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [installmentPlans.categoryId],
    references: [categories.id],
  }),
  account: one(accounts, {
    fields: [installmentPlans.accountId],
    references: [accounts.id],
  }),
  counterparty: one(counterparties, {
    fields: [installmentPlans.counterpartyId],
    references: [counterparties.id],
  }),
  transactions: many(transactions),
}));

export const shoppingStoresRelations = relations(shoppingStores, ({ one, many }) => ({
  user: one(users, {
    fields: [shoppingStores.userId],
    references: [users.id],
  }),
  counterparty: one(counterparties, {
    fields: [shoppingStores.counterpartyId],
    references: [counterparties.id],
  }),
  lists: many(shoppingLists),
}));

export const shoppingProductsRelations = relations(shoppingProducts, ({ one, many }) => ({
  user: one(users, {
    fields: [shoppingProducts.userId],
    references: [users.id],
  }),
  listItems: many(shoppingListItems),
  priceSnapshots: many(shoppingPriceSnapshots),
}));

export const shoppingListsRelations = relations(shoppingLists, ({ one, many }) => ({
  user: one(users, {
    fields: [shoppingLists.userId],
    references: [users.id],
  }),
  store: one(shoppingStores, {
    fields: [shoppingLists.storeId],
    references: [shoppingStores.id],
  }),
  registeredTransaction: one(transactions, {
    fields: [shoppingLists.registeredTransactionId],
    references: [transactions.id],
  }),
  ticketDocument: one(documents, {
    fields: [shoppingLists.ticketDocumentId],
    references: [documents.id],
  }),
  items: many(shoppingListItems),
}));

export const shoppingListItemsRelations = relations(shoppingListItems, ({ one }) => ({
  user: one(users, {
    fields: [shoppingListItems.userId],
    references: [users.id],
  }),
  list: one(shoppingLists, {
    fields: [shoppingListItems.listId],
    references: [shoppingLists.id],
  }),
  product: one(shoppingProducts, {
    fields: [shoppingListItems.productId],
    references: [shoppingProducts.id],
  }),
}));

export const shoppingPriceSnapshotsRelations = relations(
  shoppingPriceSnapshots,
  ({ one }) => ({
    user: one(users, {
      fields: [shoppingPriceSnapshots.userId],
      references: [users.id],
    }),
    product: one(shoppingProducts, {
      fields: [shoppingPriceSnapshots.productId],
      references: [shoppingProducts.id],
    }),
  })
);

export type CategoryDirection = (typeof categoryDirectionEnum.enumValues)[number];
export type TxnDirection = (typeof txnDirectionEnum.enumValues)[number];
export type TransactionKind = (typeof transactionKindEnum.enumValues)[number];
export type RuleMode = (typeof ruleModeEnum.enumValues)[number];
export type IngestJobKind = (typeof ingestJobKindEnum.enumValues)[number];
export type ShoppingListStatus = (typeof shoppingListStatusEnum.enumValues)[number];
export type ShoppingProductSource = (typeof shoppingProductSourceEnum.enumValues)[number];
