import { eq } from "drizzle-orm";

import { hashPassword } from "@/lib/server/auth/password";
import { db } from "@/lib/server/db";
import { users } from "@/lib/server/schema";

async function main() {
  const [, , username, password] = process.argv;

  if (!username || !password) {
    console.error(
      "Uso: node --env-file=.env --import tsx scripts/claim-legacy-user.ts <username> <password>"
    );
    process.exitCode = 1;
    return;
  }

  const legacyEmail = process.env.DEFAULT_USER_EMAIL;
  if (!legacyEmail) {
    console.error("DEFAULT_USER_EMAIL no esta configurado en el entorno.");
    process.exitCode = 1;
    return;
  }

  const [existing] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.email, legacyEmail))
    .limit(1);

  if (!existing) {
    console.error(`No se encontro ningun usuario con email ${legacyEmail}.`);
    process.exitCode = 1;
    return;
  }

  if (existing.username) {
    console.error(
      `El usuario ${legacyEmail} ya tiene un username asignado (${existing.username}). No se ejecuta de nuevo.`
    );
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);

  await db
    .update(users)
    .set({
      username: username.trim().toLowerCase(),
      passwordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.id, existing.id));

  console.info(
    `Listo. El usuario ${legacyEmail} ahora puede iniciar sesion con username "${username}". Todo tu historial (cuentas, categorias, movimientos) sigue intacto.`
  );
  console.info(
    "La proxima vez que inicies sesion se te pedira completar el onboarding (nombre, CUIT, CBU/alias, etc)."
  );
}

void main().then(() => process.exit(process.exitCode ?? 0));
