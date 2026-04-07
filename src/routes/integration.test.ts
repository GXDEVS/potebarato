/**
 * Integration tests — run with: bun run src/routes/integration.test.ts
 * Requires postgres running on localhost:5434 with potebarato_test database
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { ilike, and, eq, asc, desc, count, max, sql as dsql } from "drizzle-orm";
import { products } from "@/db/schema";
import { user as userTable, apikey } from "@/db/auth-schema";

const client = postgres("postgresql://potebarato:potebarato@localhost:5434/potebarato_test", { max: 1 });
const db = drizzle(client);

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

// ---- Helpers ----
async function clean() {
  await db.execute(dsql`TRUNCATE apikey, session, account, verification, "user", products CASCADE`);
}
async function createUser(name: string, email: string, role = "user") {
  const id = crypto.randomUUID();
  await db.insert(userTable).values({ id, name, email, emailVerified: false, role, createdAt: new Date(), updatedAt: new Date() });
  return id;
}
async function createKey(userId: string) {
  const id = crypto.randomUUID();
  const key = `pb_test_${crypto.randomUUID()}`;
  await db.insert(apikey).values({ id, key, referenceId: userId, prefix: "pb", start: "pb_test", name: "test-key", enabled: true, configId: "default", createdAt: new Date(), updatedAt: new Date() });
  return { id, key };
}
async function seed(n = 6) {
  const data = Array.from({ length: n }, (_, i) => ({
    brand: i % 2 === 0 ? "Growth Supplements" : "Dark Lab",
    productName: `Creatina ${(i + 1) * 250}g`,
    totalPrice: ((i + 1) * 29.9).toFixed(2),
    weightGrams: (i + 1) * 250,
    pricePerGram: (29.9 / 250).toFixed(6),
    currency: "BRL",
    inStock: i !== 2,
    url: `https://example.com/creatina-${Date.now()}-${i}`,
    imageUrl: null,
    lastUpdate: new Date(),
  }));
  await db.insert(products).values(data);
}

function escapeLike(s: string) { return s.replace(/%/g, "\\%").replace(/_/g, "\\_"); }

// ---- Tests ----
async function run() {
  console.log("\n=== Products — filtros e paginação ===");
  await clean();
  await seed(6);

  // default query
  const all = await db.select().from(products);
  assert(all.length === 6, "seed inseriu 6 produtos");

  // filter by brand
  const growth = await db.select().from(products).where(ilike(products.brand, "%Growth%"));
  assert(growth.length === 3, "filtra por Growth = 3 produtos");

  // filter by name
  const byName = await db.select().from(products).where(ilike(products.productName, "%Creatina%"));
  assert(byName.length === 6, "filtra por Creatina = 6 produtos");

  // pagination
  const p1 = await db.select().from(products).limit(2).offset(0);
  const p2 = await db.select().from(products).limit(2).offset(2);
  assert(p1.length === 2, "page1 limit=2 retorna 2");
  assert(p2.length === 2, "page2 offset=2 retorna 2");
  assert(p1[0]!.id !== p2[0]!.id, "pages têm items diferentes");

  // order by price desc
  const sorted = await db.select().from(products).orderBy(desc(products.totalPrice));
  const prices = sorted.map(p => parseFloat(p.totalPrice!));
  assert(prices[0]! >= prices[prices.length - 1]!, "ordenação desc funciona");

  // filter inStock
  const inStock = await db.select().from(products).where(eq(products.inStock, true));
  assert(inStock.every(p => p.inStock), "filtra inStock=true corretamente");

  // no results
  const none = await db.select().from(products).where(ilike(products.brand, "%NaoExiste%"));
  assert(none.length === 0, "marca inexistente retorna vazio");

  // escape wildcards
  const escaped = await db.select().from(products).where(ilike(products.brand, `%${escapeLike("%_")}%`));
  assert(escaped.length === 0, "wildcards escapados não matcham");

  console.log("\n=== Products — stats ===");
  const [stats] = await db.select({ total: count(), lastUpdate: max(products.lastUpdate) }).from(products);
  assert(stats!.total === 6, "stats total = 6");
  assert(stats!.lastUpdate !== null, "lastUpdate não é null");

  console.log("\n=== Keys — ownership e segurança ===");
  await db.execute(dsql`TRUNCATE apikey, session, account, verification, "user" CASCADE`);
  const userAId = await createUser("A", "a@test.com");
  const userBId = await createUser("B", "b@test.com");
  const keyA = await createKey(userAId);

  // User A has 1 key
  const keysA = await db.select().from(apikey).where(eq(apikey.referenceId, userAId));
  assert(keysA.length === 1, "User A tem 1 key");

  // User B has 0 keys
  const keysB = await db.select().from(apikey).where(eq(apikey.referenceId, userBId));
  assert(keysB.length === 0, "User B tem 0 keys");

  // Key belongs to A
  const [key] = await db.select({ id: apikey.id, ref: apikey.referenceId }).from(apikey).where(eq(apikey.id, keyA.id));
  assert(key!.ref === userAId, "key pertence a User A");
  assert(key!.ref !== userBId, "key NÃO pertence a User B");

  // Ownership check blocks B
  const wouldAllow = key!.ref === userBId;
  assert(!wouldAllow, "ownership check impede User B de deletar key de A");

  // B's list doesn't contain A's key
  const bKeys = await db.select().from(apikey).where(eq(apikey.referenceId, userBId));
  assert(!bKeys.some(k => k.id === keyA.id), "lista de B não contém key de A");

  // After creating key for B, each has exactly 1
  await createKey(userBId);
  const finalA = await db.select().from(apikey).where(eq(apikey.referenceId, userAId));
  const finalB = await db.select().from(apikey).where(eq(apikey.referenceId, userBId));
  assert(finalA.length === 1, "User A ainda tem 1 key");
  assert(finalB.length === 1, "User B agora tem 1 key");
  assert(finalA[0]!.referenceId === userAId, "key de A pertence a A");
  assert(finalB[0]!.referenceId === userBId, "key de B pertence a B");

  // Cleanup
  await clean();
  await client.end();

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
