// تشغيل استيراد حيّ من محوّل متجر لمدينة محددة (A3).
// يُزحف الكتالوج العام، تُنزَّل صور المنتجات كأدلّة (product_image)، وتُنشر
// الأسعار بأساس "online". وضع dry-run يثبت الوصول ويعدّ دون أي كتابة للقاعدة.

import { and, eq, lte, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { createTamimiAdapter, TAMIMI_TOP_CATEGORIES } from '../adapters/tamimiStorefront.js';
import type { StoreAdapter } from '../adapters/types.js';
import { autoCreateProduct, matchProduct, saveAlias } from '../services/productMatcher.js';
import { addEvidence } from '../services/evidence.js';
import { submitPrice } from '../services/priceResolver.js';
import { logger } from '../logger.js';

export const AUTO_INGEST_JOB = 'auto_ingest_real';

export interface IngestOptions {
  storeSlug: string;
  cityCode?: string; // غير محدد → كل فروع المتجر في كل المدن (زحف واحد، تغطية وطنية)
  dryRun?: boolean;
  maxPagesPerCategory?: number;
  categories?: string[];
  log?: (line: string) => void;
}

export interface IngestReport {
  storeSlug: string;
  cityCode: string;
  dryRun: boolean;
  pagesCrawled: number;
  productsFound: number;
  withImage: number;
  imagesDownloaded: number;
  pricesWritten: number;
  evidenceCreated: number;
  autoCreated: number;
  branches: number;
  errors: number;
}

function buildAdapter(opts: IngestOptions, onPage: () => void): StoreAdapter {
  if (opts.storeSlug === 'tamimi') {
    return createTamimiAdapter({
      categories: opts.categories ?? TAMIMI_TOP_CATEGORIES,
      maxPagesPerCategory: opts.maxPagesPerCategory,
      onPage: (info) => {
        onPage();
        opts.log?.(`  زحف ${info.category} ص${info.page}: ${info.found} منتجاً`);
      },
    });
  }
  throw new Error(`لا محوّل حيّ للمتجر: ${opts.storeSlug}`);
}

export async function runIngest(opts: IngestOptions): Promise<IngestReport> {
  const log = opts.log ?? (() => undefined);
  const dryRun = opts.dryRun ?? false;
  let pagesCrawled = 0;

  const store = await db.query.stores.findFirst({
    where: eq(schema.stores.slug, opts.storeSlug),
  });
  if (!store) throw new Error(`المتجر غير موجود في القاعدة: ${opts.storeSlug}`);

  // مدينة محددة → فلترة الفروع بها؛ بلا مدينة → كل فروع المتجر (وطنياً)
  let cityId: number | null = null;
  if (opts.cityCode) {
    const city = await db.query.cities.findFirst({ where: eq(schema.cities.code, opts.cityCode) });
    if (!city) throw new Error(`المدينة غير موجودة: ${opts.cityCode}`);
    cityId = city.id;
  }

  const branchFilters = [
    eq(schema.storeBranches.storeId, store.id),
    eq(schema.storeBranches.isActive, true),
  ];
  if (cityId != null) branchFilters.push(eq(schema.storeBranches.cityId, cityId));
  let branches = await db
    .select()
    .from(schema.storeBranches)
    .where(and(...branchFilters));

  // وضع كل المدن: السعر الإلكتروني وطني — يكفي فرع واحد لكل مدينة (تقليل الكتابة)
  if (cityId == null) {
    const byCity = new Map<number, (typeof branches)[number]>();
    for (const b of branches) if (!byCity.has(b.cityId)) byCity.set(b.cityId, b);
    branches = [...byCity.values()];
  }

  const report: IngestReport = {
    storeSlug: opts.storeSlug,
    cityCode: opts.cityCode ?? 'all',
    dryRun,
    pagesCrawled: 0,
    productsFound: 0,
    withImage: 0,
    imagesDownloaded: 0,
    pricesWritten: 0,
    evidenceCreated: 0,
    autoCreated: 0,
    branches: branches.length,
    errors: 0,
  };

  if (branches.length === 0 && !dryRun) {
    throw new Error(`لا فروع نشطة لـ ${opts.storeSlug} في ${opts.cityCode ?? 'كل المدن'}`);
  }

  const profile = await db.query.storeSourceProfiles.findFirst({
    where: eq(schema.storeSourceProfiles.storeId, store.id),
  });
  const chainSourceUrl = profile?.endpointOrUrl ?? null;

  const adapter = buildAdapter(opts, () => {
    pagesCrawled++;
  });

  log(`بدء الاستيراد: ${opts.storeSlug} → ${opts.cityCode ?? 'كل المدن'} (${branches.length} فرع)${dryRun ? ' [تجريبي]' : ''}`);
  const catalog = await adapter.fetchCatalog(opts.cityCode ?? '');
  report.pagesCrawled = pagesCrawled;
  report.productsFound = catalog.length;
  report.withImage = catalog.filter((p) => p.imageUrl).length;
  log(`اكتمل الزحف: ${pagesCrawled} صفحة، ${catalog.length} منتجاً (${report.withImage} بصورة)`);

  if (dryRun) {
    log('وضع تجريبي — لا كتابة للقاعدة.');
    return report;
  }

  for (const item of catalog) {
    try {
      let match = await matchProduct(item.rawName, store.id);
      if (!match) {
        match = await autoCreateProduct({
          rawName: item.rawName,
          storeId: store.id,
          brand: item.brand,
          barcode: item.barcode,
          storeCategoryPath: item.storeCategoryPath,
        });
        report.autoCreated++;
      } else if (match.score >= 0.8 && match.score < 1) {
        await saveAlias(match.productId, store.id, item.rawName);
      }
      const productId = match.productId;

      // صورة المنتج من مصدرها: نشير لرابط CDN البعيد مباشرة (يظهر دون تخزين
      // محلي — يعمل على Railway). نُحدّث صورة المنتج لتظهر في البطاقات والمقارنة.
      const remoteImage = item.imageUrl ?? null;
      if (remoteImage) {
        report.imagesDownloaded++;
        await db
          .update(schema.products)
          .set({ imageUrl: remoteImage })
          .where(eq(schema.products.id, productId));
      }

      for (const branch of branches) {
        const result = await submitPrice({
          productId,
          branchId: branch.id,
          price: item.price,
          source: 'scrape',
          basis: item.basis,
          sourceUrl: item.productUrl ?? chainSourceUrl,
        });
        if (result.status === 'published') {
          report.pricesWritten++;
          if (remoteImage || item.productUrl || chainSourceUrl) {
            await addEvidence({
              priceId: result.priceId,
              evidenceType: 'product_image',
              imagePath: remoteImage, // رابط الصورة الأصلي (يُمرَّر كما هو للعرض)
              sourceUrl: item.productUrl ?? chainSourceUrl,
            });
            report.evidenceCreated++;
          }
        }
      }
    } catch {
      report.errors++;
    }
  }

  log(
    `اكتمل: ${report.pricesWritten} سعراً، ${report.imagesDownloaded} صورة، ${report.evidenceCreated} دليلاً، ${report.autoCreated} منتجاً جديداً`,
  );
  return report;
}

/**
 * مهمة الاستيراد الحقيقي الكاملة (تُستخدم عند الإقلاع ومن لوحة الأدمن):
 * تلتقط حدّ معرّف السعر، تزحف التميمي، ثم تُخفي بيانات البذر السابقة بعد النجاح،
 * وتسجّل كل ذلك في job_runs. force=true يتجاهل علامة "نُفِّذ مسبقاً".
 */
export async function runRealIngestJob(opts: { force?: boolean; log?: (l: string) => void } = {}) {
  const log = opts.log ?? ((l: string) => logger.info(l));
  if (!opts.force) {
    const done = await db
      .select({ id: schema.jobRuns.id })
      .from(schema.jobRuns)
      .where(and(eq(schema.jobRuns.job, AUTO_INGEST_JOB), eq(schema.jobRuns.status, 'success')))
      .limit(1);
    if (done.length > 0) return { skipped: true as const };
  }

  const [run] = await db
    .insert(schema.jobRuns)
    .values({ job: AUTO_INGEST_JOB, status: 'running' })
    .returning({ id: schema.jobRuns.id });

  try {
    const [{ maxId }] = await db
      .select({ maxId: sql<number>`coalesce(max(${schema.prices.id}), 0)` })
      .from(schema.prices);
    const beforeMax = Number(maxId) || 0;

    const report = await runIngest({ storeSlug: 'tamimi', log });

    if (report.pricesWritten > 0 && beforeMax > 0) {
      await db.update(schema.prices).set({ isDemo: true }).where(lte(schema.prices.id, beforeMax));
      log(`أُخفيت بيانات البذر الاصطناعية القديمة (حتى السعر #${beforeMax})`);
    }
    await db
      .update(schema.jobRuns)
      .set({ status: 'success', finishedAt: new Date(), itemsOut: report.pricesWritten, detail: report })
      .where(eq(schema.jobRuns.id, run!.id));
    return { skipped: false as const, report };
  } catch (err) {
    await db
      .update(schema.jobRuns)
      .set({ status: 'failed', finishedAt: new Date(), detail: { error: String(err) } })
      .where(eq(schema.jobRuns.id, run!.id));
    throw err;
  }
}
