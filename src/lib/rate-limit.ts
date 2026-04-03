const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 100;

interface UserUsage {
  used: number;
  windowStart: number;
}

// In-memory rate limit per userId
const usageMap = new Map<string, UserUsage>();

// WebSocket subscribers: userId -> Set of ServerWebSocket
const subscribers = new Map<string, Set<any>>();

export function subscribe(userId: string, ws: any) {
  if (!subscribers.has(userId)) {
    subscribers.set(userId, new Set());
  }
  subscribers.get(userId)!.add(ws);
}

export function unsubscribe(ws: any) {
  for (const [, sockets] of subscribers) {
    sockets.delete(ws);
  }
}

function broadcast(userId: string, data: object) {
  const sockets = subscribers.get(userId);
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

function getOrResetUsage(userId: string): UserUsage {
  const now = Date.now();
  let entry = usageMap.get(userId);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    entry = { used: 0, windowStart: now };
    usageMap.set(userId, entry);
  }

  return entry;
}

export function incrementUsage(userId: string): {
  allowed: boolean;
  used: number;
  max: number;
  remaining: number;
} {
  const entry = getOrResetUsage(userId);

  if (entry.used >= MAX_REQUESTS) {
    broadcast(userId, { type: "usage", used: entry.used, max: MAX_REQUESTS, remaining: 0 });
    return { allowed: false, used: entry.used, max: MAX_REQUESTS, remaining: 0 };
  }

  entry.used += 1;
  const remaining = MAX_REQUESTS - entry.used;

  broadcast(userId, { type: "usage", used: entry.used, max: MAX_REQUESTS, remaining });

  return { allowed: true, used: entry.used, max: MAX_REQUESTS, remaining };
}

export function getUsage(userId: string) {
  const entry = getOrResetUsage(userId);
  return {
    used: entry.used,
    max: MAX_REQUESTS,
    remaining: MAX_REQUESTS - entry.used,
  };
}
