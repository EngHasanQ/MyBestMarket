import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { runMigrations } from './db/migrate.js';
import { registerAllJobs, scheduleJobs } from './jobs/index.js';

async function main() {
  await runMigrations();
  registerAllJobs();
  scheduleJobs();
  const app = createApp();
  app.listen(config.port, () => {
    logger.info(`وفّر يعمل على المنفذ ${config.port}`);
  });
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
