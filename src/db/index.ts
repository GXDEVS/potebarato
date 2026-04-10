import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";

export const db = drizzle({
  connection: {
    url: process.env.DATABASE_URL!,
    idleTimeout: 60,      // mantém conexão idle por 60s (padrão Bun é 10s)
    maxLifetime: 0,       // sem limite de vida — reconecta quando necessário
    max: 10,              // pool de até 10 conexões
  },
  schema,
});
