import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { runMigrations } from './db/migrate.js';
import { db, schema } from './db/index.js';
import { registerAllJobs, scheduleJobs } from './jobs/index.js';

/**
 * بذر تلقائي عند الإقلاع بقاعدة فارغة (لا مدن = التطبيق غير قابل للاستخدام).
 * يعمل بلا مسح إطلاقاً: الجداول غير الفارغة (مثل users المسجلين) لا تُمس.
 * يُعطَّل بـ BOOTSTRAP_SEED=false.
 */
async function bootstrapSeedIfEmpty() {
  if (process.env.BOOTSTRAP_SEED === 'false') return;
  const anyCity = await db.select().from(schema.cities).limit(1);
  if (anyCity.length > 0) return;
  logger.warn('قاعدة بيانات فارغة — تشغيل البذر التلقائي (بلا مسح)');
  const { runSeed } = await import('./seed/index.js');
  const counts = await runSeed({ wipe: false });
  logger.info(counts, 'اكتمل البذر التلقائي');
}

async function main() {
  await runMigrations();
  await bootstrapSeedIfEmpty();
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
