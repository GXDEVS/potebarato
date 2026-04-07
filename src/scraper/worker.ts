/**
 * Worker de scraping — executado como processo filho a cada 6h.
 * Para cada site: crawl (descobrir URLs) → scrape (extrair dados) → upsert (salvar no banco).
 */
import { SITE_CONFIGS } from "./sites";
import { crawl } from "./crawler";
import { scrape } from "./scraper";
import { upsertProducts } from "./db";
import { logger } from "@/lib/logger";

const WORKER_TIMEOUT = 30 * 60 * 1000; // 30 minutes max per run

async function run() {
  const startTime = Date.now();
  logger.info("worker", "Starting scrape run");

  // Kill process if it exceeds timeout
  const timer = setTimeout(() => {
    logger.error("worker", `Timeout exceeded (${WORKER_TIMEOUT / 60000}min), forcing exit`);
    process.exit(1);
  }, WORKER_TIMEOUT);

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
      logger.error("worker", `Failed for ${config.brand}`, { error: error instanceof Error ? error.stack : String(error) });
    }
  }

  clearTimeout(timer);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info("worker", `Done in ${elapsed}s`, { totalProducts, totalErrors });
}

run().catch((error) => {
  logger.error("worker", "Fatal error", { error: error instanceof Error ? error.stack : String(error) });
  process.exit(1);
});
