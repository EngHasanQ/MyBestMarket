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

/**
 * تعبئة بيانات حقيقية تلقائياً (A3): إن لم توجد أي أسعار حقيقية (غير تجريبية)،
 * يزحف كتالوج التميمي الحيّ في الخلفية ويربط الأسعار بكل فروع التميمي وطنياً،
 * مشيراً لصور المصدر مباشرة (تظهر دون تخزين محلي). لا يحجب إقلاع الخادم.
 *
 * يعمل في الإنتاج تلقائياً، أو عند AUTO_INGEST=1. يُعطَّل بـ AUTO_INGEST=false.
 * يُتخطّى في الاختبارات وعند توفّر بيانات حقيقية مسبقاً.
 */
async function autoIngestRealDataInBackground() {
  if (process.env.AUTO_INGEST === 'false') return;
  const enabled = config.isProd || process.env.AUTO_INGEST === '1';
  if (!enabled || process.env.NODE_ENV === 'test') return;

  const { eq } = await import('drizzle-orm');
  const existingReal = await db
    .select({ id: schema.prices.id })
    .from(schema.prices)
    .where(eq(schema.prices.isDemo, false))
    .limit(1);
  if (existingReal.length > 0) return; // بيانات حقيقية موجودة — لا حاجة

  void (async () => {
    try {
      const { runIngest } = await import('./ingest/runIngest.js');
      logger.info('بدء الاستيراد الحيّ التلقائي (التميمي، كل المدن) في الخلفية…');
      const report = await runIngest({ storeSlug: 'tamimi', log: (l) => logger.info(l) });
      logger.info(report, 'اكتمل الاستيراد الحيّ التلقائي');
    } catch (err) {
      logger.error({ err: String(err) }, 'فشل الاستيراد الحيّ التلقائي');
    }
  })();
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
  // بعد بدء الاستماع — لا يحجب الإقلاع
  void autoIngestRealDataInBackground();
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
