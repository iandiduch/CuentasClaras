import { and, count, desc, eq, isNull, lt } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/server/db";
import { reconcileNotifications } from "@/lib/server/notifications";
import { parseOrRespond, requireUser } from "@/lib/server/route-helpers";
import { notifications } from "@/lib/server/schema";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const bulkActionSchema = z.object({
  action: z.literal("read_all"),
});

export async function GET(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  await reconcileNotifications(user.id);

  const { searchParams } = new URL(request.url);
  const cursorParam = searchParams.get("cursor");
  const limitParam = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.trunc(limitParam), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const cursorDate = cursorParam ? new Date(cursorParam) : null;
  if (cursorParam && (!cursorDate || Number.isNaN(cursorDate.getTime()))) {
    return Response.json({ error: "cursor invalido" }, { status: 400 });
  }

  const filters = [eq(notifications.userId, user.id), isNull(notifications.dismissedAt)];
  if (cursorDate) {
    filters.push(lt(notifications.createdAt, cursorDate));
  }

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      linkHref: notifications.linkHref,
      relatedEntityId: notifications.relatedEntityId,
      isRead: notifications.isRead,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(...filters))
    .orderBy(desc(notifications.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;

  const [{ value: unreadCount }] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, user.id),
        eq(notifications.isRead, false),
        isNull(notifications.dismissedAt)
      )
    );

  return Response.json({ notifications: page, nextCursor, unreadCount });
}

export async function PATCH(request: Request) {
  const body = parseOrRespond(bulkActionSchema, await request.json());
  if (body instanceof Response) return body;

  const user = await requireUser();
  if (user instanceof Response) return user;

  const now = new Date();

  await db
    .update(notifications)
    .set({ isRead: true, updatedAt: now })
    .where(
      and(
        eq(notifications.userId, user.id),
        eq(notifications.isRead, false),
        isNull(notifications.dismissedAt)
      )
    );

  return Response.json({ ok: true });
}
