// Validate required environment variables at startup

const required = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.error(`[env] Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

if (!process.env.DATABASE_URL!.startsWith("postgresql://") && !process.env.DATABASE_URL!.startsWith("postgres://")) {
  console.error("[env] DATABASE_URL must start with postgresql:// or postgres://");
  process.exit(1);
}

if (process.env.BETTER_AUTH_SECRET!.length < 32) {
  console.error("[env] BETTER_AUTH_SECRET must be at least 32 characters");
  process.exit(1);
}

// Ensure BETTER_AUTH_URL has protocol
if (!process.env.BETTER_AUTH_URL!.startsWith("http")) {
  process.env.BETTER_AUTH_URL = `https://${process.env.BETTER_AUTH_URL}`;
}
