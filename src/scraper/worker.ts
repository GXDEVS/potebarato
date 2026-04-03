import { SITE_CONFIGS } from "./sites";
import { crawl } from "./crawler";
import { scrape } from "./scraper";
import { upsertProducts } from "./db";

async function run() {
  const startTime = Date.now();
  console.log(`[worker] Starting scrape run at ${new Date().toISOString()}`);

  let totalProducts = 0;
  let totalErrors = 0;

  for (const config of SITE_CONFIGS) {
    try {
      const urls = await crawl(config);
      const products = await scrape(urls, config);
      const upserted = await upsertProducts(products);
      totalProducts += upserted;
    } catch (error) {
      totalErrors++;
      console.error(`[worker] Failed for ${config.brand}:`, error);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `[worker] Done in ${elapsed}s — ${totalProducts} products upserted, ${totalErrors} site errors`
  );
}

run().catch((error) => {
  console.error("[worker] Fatal error:", error);
  process.exit(1);
});
