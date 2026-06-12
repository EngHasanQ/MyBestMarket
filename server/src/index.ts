import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { runMigrations } from './db/migrate.js';
import { db, schema } from './db/index.js';
import { registerAllJobs, scheduleJobs } from './jobs/index.js';

/**
 * تهيئة تلقائية عند الإقلاع — بلا مسح إطلاقاً (الحسابات المسجلة لا تُمس):
 *  - upsert كامل مدن المملكة + أيقونات التصنيفات (يلتقط الإضافات الجديدة)
 *  - بذر البيانات التجريبية كاملة فقط إذا كان كتالوج المنتجات فارغاً
 * يُعطَّل بالكامل بـ BOOTSTRAP_SEED=false.
 */
async function bootstrapSeedIfEmpty() {
  if (process.env.BOOTSTRAP_SEED === 'false') return;
  const { runSeed, ensureCities, ensureCategoryIcons, ensureSynonyms } = await import(
    './seed/index.js'
  );
  await ensureCities();
  await ensureCategoryIcons();
  await ensureSynonyms();
  const anyProduct = await db.select().from(schema.products).limit(1);
  if (anyProduct.length > 0) return;
  logger.warn('كتالوج فارغ — تشغيل البذر التلقائي (بلا مسح)');
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
