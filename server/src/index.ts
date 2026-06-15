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
const OSM_DISCOVERY_JOB = 'osm_discovery_v1';

/** اكتشاف فروع المتاجر مجاناً عبر OSM لمدن المستخدمين، مرّة واحدة (بعلامة) */
async function discoverStoresInBackground() {
  const { and, eq } = await import('drizzle-orm');
  const done = await db
    .select({ id: schema.jobRuns.id })
    .from(schema.jobRuns)
    .where(and(eq(schema.jobRuns.job, OSM_DISCOVERY_JOB), eq(schema.jobRuns.status, 'success')))
    .limit(1);
  if (done.length > 0) return;

  const [run] = await db
    .insert(schema.jobRuns)
    .values({ job: OSM_DISCOVERY_JOB, status: 'running' })
    .returning({ id: schema.jobRuns.id });
  try {
    const { discoverViaOSM } = await import('./services/osmDiscovery.js');
    // مدن بها مستخدمون (لتفادي استعلام كل مدن المملكة على Overpass)
    const cities = await db
      .selectDistinct({ cityId: schema.users.cityId })
      .from(schema.users);
    let branches = 0;
    for (const c of cities) {
      if (c.cityId == null) continue;
      try {
        const s = await discoverViaOSM(c.cityId);
        branches += s.newBranches;
        logger.info(s, `اكتشاف OSM للمدينة ${c.cityId}`);
      } catch (err) {
        logger.warn({ err: String(err) }, `فشل اكتشاف OSM للمدينة ${c.cityId}`);
      }
    }
    await db
      .update(schema.jobRuns)
      .set({ status: 'success', finishedAt: new Date(), itemsOut: branches })
      .where(eq(schema.jobRuns.id, run!.id));
  } catch (err) {
    await db
      .update(schema.jobRuns)
      .set({ status: 'failed', finishedAt: new Date(), detail: { error: String(err) } })
      .where(eq(schema.jobRuns.id, run!.id));
    logger.error({ err: String(err) }, 'فشل اكتشاف OSM');
  }
}

async function autoIngestRealDataInBackground() {
  if (process.env.AUTO_INGEST === 'false') return;
  const enabled = config.isProd || process.env.AUTO_INGEST === '1';
  if (!enabled || process.env.NODE_ENV === 'test') return;

  void (async () => {
    try {
      // 1) اكتشاف فروع المتاجر مجاناً (OSM) — قبل الاستيراد ليشمل المدن الجديدة
      await discoverStoresInBackground();
      // 2) استيراد كتالوج التميمي الحقيقي
      const { runRealIngestJob } = await import('./ingest/runIngest.js');
      logger.info('فحص الاستيراد الحيّ التلقائي (التميمي)…');
      const r = await runRealIngestJob();
      if (r.skipped) logger.info('الاستيراد الحيّ نُفِّذ مسبقاً — تخطٍّ');
      else logger.info(r.report, 'اكتمل الاستيراد الحيّ التلقائي');
    } catch (err) {
      logger.error({ err: String(err) }, 'فشل الإعداد التلقائي للبيانات');
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
