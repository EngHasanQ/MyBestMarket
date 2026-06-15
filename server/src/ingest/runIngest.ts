// تشغيل استيراد حيّ من محوّل متجر لمدينة محددة (A3).
// يُزحف الكتالوج العام، تُنزَّل صور المنتجات كأدلّة (product_image)، وتُنشر
// الأسعار بأساس "online". وضع dry-run يثبت الوصول ويعدّ دون أي كتابة للقاعدة.

import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { createTamimiAdapter, TAMIMI_TOP_CATEGORIES } from '../adapters/tamimiStorefront.js';
import type { StoreAdapter } from '../adapters/types.js';
import { autoCreateProduct, matchProduct } from '../services/productMatcher.js';
import { addEvidence } from '../services/evidence.js';
import { submitPrice } from '../services/priceResolver.js';
import { logger } from '../logger.js';

// v2: مطابقة بالباركود (لا تخمين) + إخفاء كل منتجات البذر — يُعيد التشغيل
// مرّة واحدة على النشر القادم لتصحيح أي بيانات مطابقة خاطئة سابقة.
export const AUTO_INGEST_JOB = 'auto_ingest_real_v2';

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

/** يخمّن تصنيفنا (slug) من مسار تصنيف المتجر واسم المنتج — لجعل المنتجات قابلة للتصفح */
export function guessCategorySlug(path: string | null | undefined, name: string): string | null {
  const t = `${path ?? ''} ${name}`.toLowerCase();
  const has = (...ks: string[]) => ks.some((k) => t.includes(k));
  if (has('diaper', 'baby', 'infant', 'حفاظ', 'حفاض', 'أطفال', 'رضع', 'رضّع')) return 'baby';
  if (has('dairy', 'milk', 'cheese', 'yogurt', 'laban', 'egg', 'حليب', 'جبن', 'زبادي', 'لبن', 'بيض', 'قشطة', 'زبدة'))
    return 'dairy';
  if (has('bakery', 'bread', 'bun', 'pastry', 'cake', 'خبز', 'معجنات', 'مخبوز', 'كيك', 'فطائر', 'فطيرة', 'صامولي', 'تورتيلا', 'كرواسون'))
    return 'bakery';
  if (has('meat', 'poultry', 'chicken', 'beef', 'lamb', 'fish', 'seafood', 'لحم', 'لحوم', 'دجاج', 'سمك', 'بقري', 'غنم', 'فراخ', 'كبدة'))
    return 'meat-poultry';
  if (has('vegetable', 'fruit', 'produce', 'فواكه', 'فاكهة', 'خضار', 'خضروات', 'تمر', 'تمور'))
    return 'produce';
  if (has('beverage', 'juice', 'water', 'drink', 'soda', 'cola', 'coffee', 'tea', 'عصير', 'ماء', 'مياه', 'مشروب', 'شاي', 'قهوة', 'كولا', 'نسكافيه'))
    return 'beverages';
  if (has('clean', 'detergent', 'laundry', 'dishwash', 'تنظيف', 'منظف', 'غسيل', 'صحون', 'مبيد', 'معطر', 'مطهر'))
    return 'cleaning';
  if (has('paper', 'tissue', 'towel', 'foil', 'trash', 'disposable', 'ورق', 'مناديل', 'محارم', 'قمامة', 'أكياس', 'ألمنيوم', 'فحم'))
    return 'household';
  if (has('personal', 'shampoo', 'shower', 'oral', 'tooth', 'deodorant', 'shav', 'skin', 'feminine', 'عناية', 'شامبو', 'صابون', 'أسنان', 'حلاقة', 'بشرة', 'مزيل'))
    return 'personal-care';
  if (has('appliance', 'kettle', 'iron', 'fryer', 'battery', 'جهاز', 'غلاية', 'مكواة', 'بطار'))
    return 'small-appliances';
  if (has('rice', 'pasta', 'flour', 'sugar', 'oil', 'ghee', 'cereal', 'breakfast', 'canned', 'legume', 'nuts', 'snack', 'chocolate', 'biscuit', 'أرز', 'رز', 'معكرونة', 'دقيق', 'سكر', 'زيت', 'سمن', 'حبوب', 'معلب', 'مكسرات', 'شيبس', 'بسكويت', 'شوكولا', 'بقول', 'عدس', 'فول', 'شعيرية', 'مربى', 'عسل', 'توابل', 'ملح'))
    return 'staples';
  return null;
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

  // خريطة slug التصنيف → id لتصنيف المنتجات المستوردة (قابلة للتصفح)
  const catRows = await db
    .select({ id: schema.categories.id, slug: schema.categories.slug })
    .from(schema.categories);
  const catBySlug = new Map(catRows.map((c) => [c.slug, c.id]));

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
      // مطابقة بالباركود فقط (لا تخمين) — يمنع إلصاق صورة/سعر بمنتج مختلف الاسم
      let match = await matchProduct(item.rawName, store.id, {
        barcode: item.barcode,
        allowFuzzy: false,
      });
      if (!match) {
        match = await autoCreateProduct({
          rawName: item.rawName,
          storeId: store.id,
          brand: item.brand,
          barcode: item.barcode,
          storeCategoryPath: item.storeCategoryPath,
        });
        report.autoCreated++;
      }
      const productId = match.productId;

      // تصنيف المنتج ضمن تصنيفاتنا (قابل للتصفح) + صورة المصدر البعيدة
      const slug = guessCategorySlug(item.storeCategoryPath, item.rawName);
      const categoryId = slug ? catBySlug.get(slug) : undefined;
      const remoteImage = item.imageUrl ?? null;
      const set: Partial<typeof schema.products.$inferInsert> = {};
      if (remoteImage) {
        set.imageUrl = remoteImage;
        report.imagesDownloaded++;
      }
      if (categoryId) set.categoryId = categoryId;
      if (Object.keys(set).length > 0) {
        await db.update(schema.products).set(set).where(eq(schema.products.id, productId));
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
    const report = await runIngest({ storeSlug: 'tamimi', log });

    // بعد نجاح الاستيراد: أظهر فقط المنتجات الحقيقية المستوردة (auto_created)،
    // وأخفِ أسعار منتجات البذر الاصطناعية (status='active') حتى لا تظهر بصور خاطئة.
    if (report.pricesWritten > 0) {
      const hidden = await db
        .update(schema.prices)
        .set({ isDemo: true })
        .where(
          sql`product_id IN (SELECT id FROM products WHERE status = 'active')`,
        )
        .returning({ id: schema.prices.id });
      log(`أُخفيت أسعار ${hidden.length} من منتجات البذر الاصطناعية`);
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
