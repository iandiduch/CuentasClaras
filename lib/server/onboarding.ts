import { db } from "@/lib/server/db";
import { normalizeText } from "@/lib/server/normalize";
import { userIdentities } from "@/lib/server/schema";

export async function seedUserIdentities(userId: string, fullName: string, email: string | null) {
  const now = new Date();
  const normalizedFullName = normalizeText(fullName);
  const emailAlias = email && email.includes("@") ? email.split("@")[0] : null;
  const aliases = Array.from(new Set([fullName, normalizedFullName, emailAlias].filter(
    (value): value is string => Boolean(value && value.length)
  )));

  for (const value of aliases) {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue.length) {
      continue;
    }
    await db
      .insert(userIdentities)
      .values({
        userId,
        identityType: "person_name",
        identityValue: value,
        normalizedValue,
        isPrimary: normalizedValue === normalizedFullName,
        createdAt: now,
      })
      .onConflictDoNothing({
        target: [
          userIdentities.userId,
          userIdentities.identityType,
          userIdentities.normalizedValue,
        ],
      });
  }
}
