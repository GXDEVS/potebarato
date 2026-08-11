import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";

export const db = drizzle({
  connection: {
    url: process.env.DATABASE_URL!,
    idleTimeout: 10,   // fecha conexões idle em 10s — antes do server dropar
    max: 5,
  },
  schema,
});
