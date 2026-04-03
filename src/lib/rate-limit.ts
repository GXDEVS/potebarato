import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apikey } from "@/db/auth-schema";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 100;

// WebSocket subscribers: keyId -> Set of ServerWebSocket
const subscribers = new Map<string, Set<any>>();

export function subscribe(keyId: string, ws: any) {
  if (!subscribers.has(keyId)) {
    subscribers.set(keyId, new Set());
  }
  subscribers.get(keyId)!.add(ws);
}

export function unsubscribe(ws: any) {
  for (const [, sockets] of subscribers) {
    sockets.delete(ws);
  }
}

function broadcast(keyId: string, data: object) {
  const sockets = subscribers.get(keyId);
  if (!sockets) return;
  const msg = JSON.stringify(data);
  for (const ws of sockets) {
    try {
      ws.send(msg);
    } catch {
      sockets.delete(ws);
    }
  }
}

export async function incrementUsage(keyId: string): Promise<{
  allowed: boolean;
  used: number;
  max: number;
  remaining: number;
}> {
  const [key] = await db
    .select()
    .from(apikey)
    .where(eq(apikey.id, keyId))
    .limit(1);

  if (!key || !key.enabled) {
    return { allowed: false, used: 0, max: MAX_REQUESTS, remaining: 0 };
  }

  const now = new Date();
  const max = key.rateLimitMax ?? MAX_REQUESTS;
  let remaining = key.remaining ?? max;
  let requestCount = key.requestCount ?? 0;
  let lastRefill = key.lastRefillAt;

  // Refill if window expired
  if (!lastRefill || now.getTime() - lastRefill.getTime() >= WINDOW_MS) {
    remaining = max;
    requestCount = 0;
    lastRefill = now;
  }

  // Blocked
  if (remaining <= 0) {
    const used = max;
    broadcast(keyId, { type: "usage", used, max, remaining: 0 });
    return { allowed: false, used, max, remaining: 0 };
  }

  // Decrement
  remaining -= 1;
  requestCount += 1;

  await db
    .update(apikey)
    .set({
      remaining,
      requestCount,
      lastRefillAt: lastRefill,
      lastRequest: now,
    })
    .where(eq(apikey.id, keyId));

  const used = max - remaining;
  broadcast(keyId, { type: "usage", used, max, remaining });

  return { allowed: true, used, max, remaining };
}

export async function getUsage(keyId: string) {
  const [key] = await db
    .select()
    .from(apikey)
    .where(eq(apikey.id, keyId))
    .limit(1);

  if (!key) return null;

  const now = new Date();
  const max = key.rateLimitMax ?? MAX_REQUESTS;
  let remaining = key.remaining ?? max;
  const lastRefill = key.lastRefillAt;

  if (!lastRefill || now.getTime() - lastRefill.getTime() >= WINDOW_MS) {
    remaining = max;
  }

  return { used: max - remaining, max, remaining };
}
