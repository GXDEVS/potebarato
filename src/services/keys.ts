import { db } from "@/db";
import { apikey } from "@/db/auth-schema";
import { eq } from "drizzle-orm";

export async function getKeysByUser(userId: string) {
  return db
    .select()
    .from(apikey)
    .where(eq(apikey.referenceId, userId));
}

export async function getUserKeyCount(userId: string) {
  const keys = await db
    .select({ id: apikey.id })
    .from(apikey)
    .where(eq(apikey.referenceId, userId))
    .limit(1);
  return keys.length;
}

export async function getKeyById(keyId: string) {
  const [key] = await db
    .select({ id: apikey.id, referenceId: apikey.referenceId })
    .from(apikey)
    .where(eq(apikey.id, keyId))
    .limit(1);
  return key ?? null;
}
