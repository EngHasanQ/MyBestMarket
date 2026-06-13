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
 * تعبئة بيانات حقيقية تلقائياً (A3) في الخلفية، مرّة واحدة (تُتتبَّع بعلامة في
 * job_runs — لا تعتمد على is_demo حتى لا تخدعها بيانات بذر قديمة سبقت العمود):
 *  - يزحف كتالوج التميمي الحيّ ويربط الأسعار بفرع لكل مدينة، مشيراً لصور المصدر.
 *  - بعد نجاح الاستيراد فقط: يُعلّم بيانات البذر الاصطناعية السابقة كـ is_demo
 *    (حسب حد معرّف السعر) فتُخفى في الإنتاج، ويبقى الكتالوج الحقيقي بصوره وأدلّته.
 *
 * يعمل في الإنتاج أو عند AUTO_INGEST=1. يُعطَّل بـ AUTO_INGEST=false. يُتخطّى في الاختبارات.
 */
async function autoIngestRealDataInBackground() {
  if (process.env.AUTO_INGEST === 'false') return;
  const enabled = config.isProd || process.env.AUTO_INGEST === '1';
  if (!enabled || process.env.NODE_ENV === 'test') return;

  void (async () => {
    try {
      const { runRealIngestJob } = await import('./ingest/runIngest.js');
      logger.info('فحص الاستيراد الحيّ التلقائي (التميمي)…');
      const r = await runRealIngestJob();
      if (r.skipped) logger.info('الاستيراد الحيّ نُفِّذ مسبقاً — تخطٍّ');
      else logger.info(r.report, 'اكتمل الاستيراد الحيّ التلقائي');
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
