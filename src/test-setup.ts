import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { user, session, apikey } from "@/db/auth-schema";

const TEST_DB_URL = process.env.TEST_DATABASE_URL
  ?? "postgresql://potebarato:potebarato@localhost:5434/potebarato_test";

const client = postgres(TEST_DB_URL, { max: 1 });
export const testDb = drizzle(client, { schema });

/** Close the database connection */
export async function closeTestDb() {
  await client.end();
}

/** Clean all tables between test suites */
export async function cleanDb() {
  await testDb.execute(sql`TRUNCATE apikey, session, account, verification, "user", products CASCADE`);
}

/** Insert a test user directly and return their ID */
export async function createTestUser(opts: {
  name: string;
  email: string;
  role?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  await testDb.insert(user).values({
    id,
    name: opts.name,
    email: opts.email,
    emailVerified: false,
    role: opts.role ?? "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

/** Create a test session and return the token */
export async function createTestSession(userId: string): Promise<string> {
  const token = crypto.randomUUID();
  const id = crypto.randomUUID();
  await testDb.insert(session).values({
    id,
    token,
    userId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return token;
}

/** Insert a test API key directly and return key ID */
export async function createTestApiKey(userId: string): Promise<{ id: string; key: string }> {
  const id = crypto.randomUUID();
  const key = `pb_test_${crypto.randomUUID()}`;
  await testDb.insert(apikey).values({
    id,
    key,
    referenceId: userId,
    prefix: "pb",
    start: "pb_test",
    name: "test-key",
    enabled: true,
    configId: "default",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { id, key };
}

/** Insert test products */
export async function seedProducts(count = 3) {
  const { products } = schema;
  const data = Array.from({ length: count }, (_, i) => ({
    brand: i % 2 === 0 ? "Growth Supplements" : "Dark Lab",
    productName: `Creatina ${(i + 1) * 250}g`,
    totalPrice: ((i + 1) * 29.9).toFixed(2),
    weightGrams: (i + 1) * 250,
    pricePerGram: (29.9 / 250).toFixed(6),
    currency: "BRL",
    inStock: true,
    url: `https://example.com/creatina-${i}`,
    imageUrl: null,
    lastUpdate: new Date(),
  }));
  await testDb.insert(products).values(data);
}
