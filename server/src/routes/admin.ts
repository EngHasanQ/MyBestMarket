// لوحة الإدارة (القسم 5-E + أقسام الملحق 13 و15)

import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { logger } from '../logger.js';
import { adminRequired } from '../middleware/auth.js';
import { normalizeArabic } from '../services/normalize.js';
import { submitPrice, accuracyKpi } from '../services/priceResolver.js';
import { parseFlyerText, parseValidity } from '../services/ocr/flyerParser.js';
import { matchProduct, autoCreateProduct } from '../services/productMatcher.js';
import { processFlyerPdf } from '../services/ocr/flyerPdf.js';
import { runRealIngestJob, AUTO_INGEST_JOB } from '../ingest/runIngest.js';
import { addEvidence } from '../services/evidence.js';
import { runDiscoveryForCity, type PlaceResult } from '../services/discovery.js';
import { qualifyStore, confirmSource, qualifyPendingStores } from '../services/sourceQualification.js';
import { runJob, getJobNames } from '../jobs/framework.js';
import { baseConfidence } from '../services/confidence.js';

export const adminRouter = Router();
adminRouter.use(adminRequired);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ---------- إدارة الكيانات الأساسية ----------
const storeSchema = z.object({
  nameAr: z.string().min(1),
  slug: z.string().min(1),
  type: z.enum(['supermarket', 'grocery', 'specialty']).default('supermarket'),
  logoUrl: z.string().nullable().optional(),
});

adminRouter.get('/stores', async (_req, res, next) => {
  try {
    const rows = await db.select().from(schema.stores).orderBy(schema.stores.id);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/stores', async (req, res, next) => {
  try {
    const body = storeSchema.parse(req.body);
    const [row] = await db.insert(schema.stores).values(body).returning();
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

const branchSchema = z.object({
  storeId: z.number().int(),
  cityId: z.number().int(),
  nameAr: z.string().min(1),
  address: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  isActive: z.boolean().default(true),
});

adminRouter.post('/branches', async (req, res, next) => {
  try {
    const body = branchSchema.parse(req.body);
    const [row] = await db.insert(schema.storeBranches).values(body).returning();
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

const productSchema = z.object({
  nameAr: z.string().min(1),
  brand: z.string().nullable().optional(),
  sizeValue: z.number().nullable().optional(),
  sizeUnit: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  categoryId: z.number().int(),
  imageUrl: z.string().nullable().optional(),
});

adminRouter.post('/products', async (req, res, next) => {
  try {
    const body = productSchema.parse(req.body);
    const [row] = await db
      .insert(schema.products)
      .values({
        ...body,
        sizeValue: body.sizeValue != null ? String(body.sizeValue) : null,
        normalizedName: normalizeArabic(body.nameAr),
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

/** تحديث صورة/بيانات منتج (مثلاً ربط صورة رسمية من موقع المتجر) */
adminRouter.patch('/products/:id', async (req, res, next) => {
  try {
    const body = z
      .object({
        imageUrl: z.string().url().nullable().optional(),
        nameAr: z.string().min(1).optional(),
        categoryId: z.number().int().optional(),
      })
      .parse(req.body);
    const patch: Record<string, unknown> = { ...body };
    if (body.nameAr) patch.normalizedName = normalizeArabic(body.nameAr);
    const [row] = await db
      .update(schema.products)
      .set(patch)
      .where(eq(schema.products.id, Number(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: 'المنتج غير موجود' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

const manualPriceSchema = z.object({
  productId: z.number().int(),
  branchId: z.number().int(),
  price: z.number().positive(),
  isOffer: z.boolean().default(false),
  offerEndsAt: z.coerce.date().nullable().optional(),
});

adminRouter.post('/prices', async (req, res, next) => {
  try {
    const body = manualPriceSchema.parse(req.body);
    const result = await submitPrice({
      ...body,
      source: 'manual_admin',
      basis: 'shelf',
      reportedBy: req.user!.id,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ---------- خط OCR للمجلات + قائمة المراجعة (القسم 2.2) ----------
const flyerMetaSchema = z.object({
  branchId: z.coerce.number().int(),
  offerEndsAt: z.coerce.date().optional(),
  ocrText: z.string().max(50_000).optional(),
});

adminRouter.post('/flyers/upload', upload.single('image'), async (req, res, next) => {
  try {
    const meta = flyerMetaSchema.parse(req.body);
    let text = meta.ocrText ?? null;
    let flyerImageUrl: string | null = null;
    if (req.file) {
      // صفحة المجلة تُحفظ كدليل سعر يراه المستخدم بعد الاعتماد
      const { saveUpload } = await import('../uploads.js');
      flyerImageUrl = saveUpload(req.file.buffer, req.file.originalname);
      if (!text) {
        const { ocrImage } = await import('../services/ocr/engine.js');
        text = await ocrImage(req.file.buffer);
      }
    }
    if (!text) return res.status(400).json({ error: 'أرفق صورة المجلة أو نص OCR' });

    const branch = await db.query.storeBranches.findFirst({
      where: eq(schema.storeBranches.id, meta.branchId),
    });
    if (!branch) return res.status(404).json({ error: 'الفرع غير موجود' });

    const candidates = parseFlyerText(text);
    const queued = [];
    for (const c of candidates) {
      const match = await matchProduct(c.productName, branch.storeId);
      const [row] = await db
        .insert(schema.offersReviewQueue)
        .values({
          branchId: meta.branchId,
          kind: 'flyer',
          rawText: c.rawText,
          parsedProductName: c.productName,
          parsedPrice: String(c.price),
          matchedProductId: match?.productId ?? null,
          flyerImageUrl,
          offerEndsAt: meta.offerEndsAt ?? null,
          status: 'pending',
        })
        .returning();
      queued.push(row);
    }
    res.status(201).json({ extracted: candidates.length, queued });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/review-queue', async (req, res, next) => {
  try {
    const status = (req.query.status as string) ?? 'pending';
    const rows = await db
      .select({
        id: schema.offersReviewQueue.id,
        branchId: schema.offersReviewQueue.branchId,
        kind: schema.offersReviewQueue.kind,
        rawText: schema.offersReviewQueue.rawText,
        parsedProductName: schema.offersReviewQueue.parsedProductName,
        parsedPrice: schema.offersReviewQueue.parsedPrice,
        matchedProductId: schema.offersReviewQueue.matchedProductId,
        matchedProductName: schema.products.nameAr,
        offerEndsAt: schema.offersReviewQueue.offerEndsAt,
        status: schema.offersReviewQueue.status,
        createdAt: schema.offersReviewQueue.createdAt,
        branchName: schema.storeBranches.nameAr,
      })
      .from(schema.offersReviewQueue)
      .leftJoin(schema.products, eq(schema.offersReviewQueue.matchedProductId, schema.products.id))
      .innerJoin(schema.storeBranches, eq(schema.offersReviewQueue.branchId, schema.storeBranches.id))
      .where(eq(schema.offersReviewQueue.status, status as 'pending'))
      .orderBy(desc(schema.offersReviewQueue.createdAt))
      .limit(200);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

const reviewActionSchema = z.object({
  productId: z.number().int().optional(), // تصحيح المطابقة قبل الاعتماد
  price: z.number().positive().optional(),
  offerEndsAt: z.coerce.date().nullable().optional(),
});

/** اعتماد عنصر مراجعة → سعر منشور بمصدر flyer_ocr_verified وثقة 95 (ضمان الـ99%) */
adminRouter.post('/review-queue/:id/approve', async (req, res, next) => {
  try {
    const body = reviewActionSchema.parse(req.body ?? {});
    const item = await db.query.offersReviewQueue.findFirst({
      where: eq(schema.offersReviewQueue.id, Number(req.params.id)),
    });
    if (!item) return res.status(404).json({ error: 'العنصر غير موجود' });
    if (item.status !== 'pending') return res.status(409).json({ error: 'عنصر مراجَع مسبقاً' });

    const productId = body.productId ?? item.matchedProductId;
    if (!productId) return res.status(422).json({ error: 'حدد المنتج المطابق أولاً' });
    const price = body.price ?? (item.parsedPrice != null ? Number(item.parsedPrice) : null);
    if (price == null) return res.status(422).json({ error: 'حدد السعر' });

    const isFlyer = item.kind === 'flyer';
    // إثبات المصدر: صورة صفحة المجلة + رابط صفحة العروض في موقع السلسلة
    const branch = await db.query.storeBranches.findFirst({
      where: eq(schema.storeBranches.id, item.branchId),
    });
    const flyerProfile = branch
      ? await db.query.storeSourceProfiles.findFirst({
          where: and(
            eq(schema.storeSourceProfiles.storeId, branch.storeId),
            eq(schema.storeSourceProfiles.sourceType, 'flyer'),
          ),
        })
      : null;
    const [row] = await db
      .insert(schema.prices)
      .values({
        productId,
        branchId: item.branchId,
        price: String(price),
        source: isFlyer ? 'flyer_ocr_verified' : 'user_report',
        basis: 'shelf',
        isOffer: isFlyer,
        offerEndsAt: body.offerEndsAt ?? item.offerEndsAt ?? null,
        confidence: baseConfidence(isFlyer ? 'flyer_ocr_verified' : 'user_report'),
        reportedBy: req.user!.id,
        proofImageUrl: item.flyerImageUrl,
        sourceUrl: flyerProfile?.endpointOrUrl ?? null,
      })
      .returning({ id: schema.prices.id });

    // دليل السعر: صورة صفحة المجلة + رابط صفحة العروض (جزء 2.1)
    if (item.flyerImageUrl || flyerProfile?.endpointOrUrl) {
      const { addEvidence } = await import('../services/evidence.js');
      await addEvidence({
        priceId: row!.id,
        evidenceType: 'flyer_crop',
        imagePath: item.flyerImageUrl,
        sourceUrl: flyerProfile?.endpointOrUrl ?? null,
      });
    }

    // الاعتماد مسجَّل بهوية المراجِع (القسم 7)
    await db
      .update(schema.offersReviewQueue)
      .set({ status: 'approved', reviewedBy: req.user!.id, matchedProductId: productId })
      .where(eq(schema.offersReviewQueue.id, item.id));
    res.json({ priceId: row!.id });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/review-queue/:id/reject', async (req, res, next) => {
  try {
    const [row] = await db
      .update(schema.offersReviewQueue)
      .set({ status: 'rejected', reviewedBy: req.user!.id })
      .where(
        and(
          eq(schema.offersReviewQueue.id, Number(req.params.id)),
          eq(schema.offersReviewQueue.status, 'pending'),
        ),
      )
      .returning();
    if (!row) return res.status(404).json({ error: 'العنصر غير موجود أو مراجَع' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// ---------- خط مجلات PDF متعددة الصفحات (A2) ----------
// معالجة غير متزامنة مع مؤشر تقدّم: الرفع يردّ فوراً بـ jobId ثم يُعالَج بالخلفية.

interface FlyerJob {
  id: string;
  branchId: number;
  status: 'running' | 'success' | 'failed';
  pageCount: number;
  processed: number;
  candidates: number;
  queued: number;
  cropsSaved: number;
  validity: { startsAt: string | null; endsAt: string | null } | null;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

const flyerJobs = new Map<string, FlyerJob>();

/** نشر عنصر مراجعة مجلة كسعر موثق + دليل قصاصة؛ يعيد إن أُنشئ تلقائياً ودليل */
async function publishFlyerItem(
  item: typeof schema.offersReviewQueue.$inferSelect,
  opts: { reviewerId: number; productId?: number; price?: number; offerEndsAt?: Date | null; autoCreate?: boolean },
): Promise<{ priceId: number; autoCreated: boolean; evidenceCreated: boolean } | null> {
  const branch = await db.query.storeBranches.findFirst({
    where: eq(schema.storeBranches.id, item.branchId),
  });
  if (!branch) return null;

  let productId = opts.productId ?? item.matchedProductId ?? null;
  let autoCreated = false;
  if (!productId && opts.autoCreate && item.parsedProductName) {
    const created = await autoCreateProduct({ rawName: item.parsedProductName, storeId: branch.storeId });
    productId = created.productId;
    autoCreated = true;
  }
  if (!productId) return null;

  const price = opts.price ?? (item.parsedPrice != null ? Number(item.parsedPrice) : null);
  if (price == null) return null;

  const flyerProfile = await db.query.storeSourceProfiles.findFirst({
    where: and(
      eq(schema.storeSourceProfiles.storeId, branch.storeId),
      eq(schema.storeSourceProfiles.sourceType, 'flyer'),
    ),
  });

  const [row] = await db
    .insert(schema.prices)
    .values({
      productId,
      branchId: item.branchId,
      price: String(price),
      source: 'flyer_ocr_verified',
      basis: 'shelf',
      isOffer: true,
      offerEndsAt: opts.offerEndsAt ?? item.offerEndsAt ?? null,
      confidence: baseConfidence('flyer_ocr_verified'),
      reportedBy: opts.reviewerId,
      proofImageUrl: item.flyerImageUrl,
      sourceUrl: flyerProfile?.endpointOrUrl ?? null,
    })
    .returning({ id: schema.prices.id });

  let evidenceCreated = false;
  // قصاصة المنتج من صفحة المجلة هي الدليل (flyer_crop) — صورة فعلية لمصدر السعر
  if (item.flyerImageUrl || flyerProfile?.endpointOrUrl) {
    await addEvidence({
      priceId: row!.id,
      evidenceType: 'flyer_crop',
      imagePath: item.flyerImageUrl,
      sourceUrl: flyerProfile?.endpointOrUrl ?? null,
    });
    evidenceCreated = true;
  }

  await db
    .update(schema.offersReviewQueue)
    .set({ status: 'approved', reviewedBy: opts.reviewerId, matchedProductId: productId })
    .where(eq(schema.offersReviewQueue.id, item.id));

  return { priceId: row!.id, autoCreated, evidenceCreated };
}

adminRouter.post('/flyers/upload-pdf', upload.single('pdf'), async (req, res, next) => {
  try {
    const branchId = z.coerce.number().int().parse(req.body.branchId);
    if (!req.file) return res.status(400).json({ error: 'أرفق ملف PDF للمجلة' });
    const isPdf =
      req.file.mimetype === 'application/pdf' || /\.pdf$/i.test(req.file.originalname ?? '');
    if (!isPdf) return res.status(415).json({ error: 'الملف ليس PDF' });

    const branch = await db.query.storeBranches.findFirst({
      where: eq(schema.storeBranches.id, branchId),
    });
    if (!branch) return res.status(404).json({ error: 'الفرع غير موجود' });

    const id = randomUUID();
    const job: FlyerJob = {
      id,
      branchId,
      status: 'running',
      pageCount: 0,
      processed: 0,
      candidates: 0,
      queued: 0,
      cropsSaved: 0,
      validity: null,
      startedAt: Date.now(),
    };
    flyerJobs.set(id, job);
    const reviewerId = req.user!.id;
    const buffer = req.file.buffer;

    // معالجة بالخلفية — لا ننتظرها في الطلب
    void (async () => {
      try {
        const result = await processFlyerPdf(buffer, (processed, total, candidates) => {
          job.processed = processed;
          job.pageCount = total;
          job.candidates = candidates;
        });
        const validity = parseValidity(result.coverText);
        job.validity = {
          startsAt: validity.startsAt?.toISOString() ?? null,
          endsAt: validity.endsAt?.toISOString() ?? null,
        };
        // أدرج المرشّحين في قائمة المراجعة، كلٌّ بقصاصته دليلاً
        for (const c of result.candidates) {
          const match = await matchProduct(c.productName, branch.storeId);
          await db.insert(schema.offersReviewQueue).values({
            branchId,
            kind: 'flyer',
            rawText: c.rawText,
            parsedProductName: c.productName,
            parsedPrice: String(c.price),
            matchedProductId: match?.productId ?? null,
            flyerImageUrl: c.cropImageName, // اسم القصاصة في مخزن الأدلة
            offerEndsAt: validity.endsAt ?? null,
            status: 'pending',
          });
          job.queued++;
          if (c.cropImageName) job.cropsSaved++;
        }
        job.status = 'success';
        job.finishedAt = Date.now();
      } catch (err) {
        job.status = 'failed';
        job.error = String(err);
        job.finishedAt = Date.now();
        logger.error({ err: String(err) }, 'flyer pdf job failed');
      }
    })();

    res.status(202).json({ jobId: id });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/flyers/jobs/:id', (req, res) => {
  const job = flyerJobs.get(req.params.id!);
  if (!job) return res.status(404).json({ error: 'المهمة غير موجودة' });
  res.json(job);
});

// ---------- استيراد البيانات الحقيقية (التميمي) — تشغيل يدوي + حالة ----------
adminRouter.post('/ingest/real', async (_req, res, next) => {
  try {
    const running = await db
      .select({ id: schema.jobRuns.id })
      .from(schema.jobRuns)
      .where(and(eq(schema.jobRuns.job, AUTO_INGEST_JOB), eq(schema.jobRuns.status, 'running')))
      .limit(1);
    if (running.length > 0) return res.status(409).json({ error: 'استيراد جارٍ بالفعل' });
    // تشغيل في الخلفية (force=true لإعادة الزحف وتحديث البيانات)
    void runRealIngestJob({ force: true }).catch((err) =>
      logger.error({ err: String(err) }, 'فشل الاستيراد اليدوي'),
    );
    res.status(202).json({ started: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/ingest/real/status', async (_req, res, next) => {
  try {
    const [last] = await db
      .select()
      .from(schema.jobRuns)
      .where(eq(schema.jobRuns.job, AUTO_INGEST_JOB))
      .orderBy(desc(schema.jobRuns.startedAt))
      .limit(1);
    const [counts] = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM prices WHERE is_demo = false)::int AS real_prices,
        (SELECT COUNT(*) FROM products WHERE image_url LIKE 'http%')::int AS products_with_image,
        (SELECT COUNT(*) FROM price_evidence WHERE evidence_type = 'product_image')::int AS product_image_evidence
    `).then((r) => r.rows as Array<Record<string, number>>);
    res.json({ job: last ?? null, counts: counts ?? {} });
  } catch (err) {
    next(err);
  }
});

// اعتماد جماعي: ينشر كل عناصر المراجعة المعلّقة لفرع، ويُنشئ المنتجات غير المطابقة
const approveAllSchema = z.object({
  branchId: z.coerce.number().int(),
  autoCreate: z.coerce.boolean().default(true),
});

adminRouter.post('/review-queue/approve-all', async (req, res, next) => {
  try {
    const { branchId, autoCreate } = approveAllSchema.parse({ ...req.query, ...req.body });
    const pending = await db
      .select()
      .from(schema.offersReviewQueue)
      .where(
        and(
          eq(schema.offersReviewQueue.branchId, branchId),
          eq(schema.offersReviewQueue.status, 'pending'),
          eq(schema.offersReviewQueue.kind, 'flyer'),
        ),
      )
      .limit(500);

    let approved = 0;
    let autoCreated = 0;
    let evidenceCreated = 0;
    for (const item of pending) {
      const r = await publishFlyerItem(item, { reviewerId: req.user!.id, autoCreate });
      if (!r) continue;
      approved++;
      if (r.autoCreated) autoCreated++;
      if (r.evidenceCreated) evidenceCreated++;
    }
    res.json({ approved, autoCreated, evidenceCreated, total: pending.length });
  } catch (err) {
    next(err);
  }
});

// ---------- الاكتشاف وتأهيل المصادر (القسم 13) ----------
const discoverSchema = z.object({
  cityId: z.number().int(),
  // fixture للاختبار وبيئات بلا مفتاح Google
  fixturePlaces: z
    .array(
      z.object({
        placeId: z.string(),
        name: z.string(),
        lat: z.number(),
        lng: z.number(),
        types: z.array(z.string()),
        website: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        rating: z.number().nullable().optional(),
        userRatingsTotal: z.number().nullable().optional(),
      }),
    )
    .optional(),
});

adminRouter.post('/discovery/run', async (req, res, next) => {
  try {
    const body = discoverSchema.parse(req.body);
    const stats = await runDiscoveryForCity(body.cityId, body.fixturePlaces as PlaceResult[] | undefined);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/discovered-places', async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const rows = await db
      .select()
      .from(schema.discoveredPlaces)
      .where(status ? eq(schema.discoveredPlaces.status, status as 'pending') : undefined)
      .orderBy(desc(schema.discoveredPlaces.updatedAt))
      .limit(500);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

const qualifySchema = z.object({
  storeId: z.number().int(),
  website: z.string().nullable().optional(),
  fixtureHtml: z.string().nullable().optional(),
});

adminRouter.post('/qualification/run', async (req, res, next) => {
  try {
    const body = qualifySchema.parse(req.body);
    res.json(await qualifyStore(body.storeId, body));
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/qualification/run-all', async (_req, res, next) => {
  try {
    res.json(await qualifyPendingStores());
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/source-profiles', async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: schema.storeSourceProfiles.id,
        storeId: schema.storeSourceProfiles.storeId,
        storeName: schema.stores.nameAr,
        sourceType: schema.storeSourceProfiles.sourceType,
        endpointOrUrl: schema.storeSourceProfiles.endpointOrUrl,
        platformHint: schema.storeSourceProfiles.platformHint,
        priceBasis: schema.storeSourceProfiles.priceBasis,
        isConfirmed: schema.storeSourceProfiles.isConfirmed,
        lastSuccessAt: schema.storeSourceProfiles.lastSuccessAt,
        failureCount: schema.storeSourceProfiles.failureCount,
      })
      .from(schema.storeSourceProfiles)
      .innerJoin(schema.stores, eq(schema.storeSourceProfiles.storeId, schema.stores.id))
      .orderBy(schema.storeSourceProfiles.storeId);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** تأكيد الأدمن لمصدر — يفعّل السلسلة وفروعها (مرة واحدة لكل سلسلة، قسم 13.2) */
adminRouter.post('/source-profiles/:id/confirm', async (req, res, next) => {
  try {
    res.json(await confirmSource(Number(req.params.id)));
  } catch (err) {
    next(err);
  }
});

/** ترقية مكان مستبعَد يدوياً بعد العثور على مصدر لاحقاً (قسم 13.2) */
adminRouter.post('/discovered-places/:placeId/promote', async (req, res, next) => {
  try {
    const [row] = await db
      .update(schema.discoveredPlaces)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(eq(schema.discoveredPlaces.placeId, req.params.placeId))
      .returning();
    if (!row) return res.status(404).json({ error: 'المكان غير موجود' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// ---------- الوظائف والمراقبة (القسم 15) ----------
adminRouter.get('/jobs', async (_req, res, next) => {
  try {
    const names = getJobNames();
    const runs = await db.execute(sql`
      SELECT DISTINCT ON (job) * FROM job_runs ORDER BY job, started_at DESC
    `);
    res.json({ jobs: names, lastRuns: runs.rows });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/jobs/:name/run', async (req, res, next) => {
  try {
    res.json(await runJob(req.params.name));
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/job-runs', async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(schema.jobRuns)
      .orderBy(desc(schema.jobRuns.startedAt))
      .limit(100);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---------- أدوات الكتالوج (سبرنت v2 — جزء 1) ----------

/** دمج منتج مكرر في منتج قياسي (الأسعار والأسماء والقوائم تنتقل، مع أثر) */
adminRouter.post('/products/:id/merge', async (req, res, next) => {
  try {
    const body = z.object({ targetId: z.number().int() }).parse(req.body);
    const { mergeProducts } = await import('../services/productMatcher.js');
    const moved = await mergeProducts(Number(req.params.id), body.targetId);
    res.json({ ok: true, moved });
  } catch (err) {
    next(err);
  }
});

/** تقرير تغطية الاستيراد لكل متجر (جزء 1.1) */
adminRouter.get('/coverage', async (_req, res, next) => {
  try {
    const result = await db.execute(sql`
      SELECT s.id AS store_id, s.name_ar,
        (SELECT COUNT(DISTINCT p.product_id) FROM prices p
          JOIN store_branches b ON b.id = p.branch_id
          WHERE b.store_id = s.id)::int AS products_with_price,
        (SELECT COUNT(*) FROM product_aliases a WHERE a.store_id = s.id)::int AS aliases,
        (SELECT COUNT(*) FROM products pr
          JOIN product_aliases al ON al.product_id = pr.id AND al.store_id = s.id
          WHERE pr.status = 'auto_created')::int AS auto_created,
        (SELECT COUNT(*) FROM category_mappings cm
          WHERE cm.store_id = s.id AND cm.category_id IS NULL)::int AS unmapped_categories
      FROM stores s ORDER BY s.id
    `);
    // آخر زحف كامل ناجح لكل متجر من تفاصيل job_runs
    const lastRuns = await db.execute(sql`
      SELECT detail, started_at FROM job_runs
      WHERE job = 'catalog-refresh' AND status = 'success'
      ORDER BY started_at DESC LIMIT 1
    `);
    res.json({ stores: result.rows, lastCrawl: lastRuns.rows[0] ?? null });
  } catch (err) {
    next(err);
  }
});

/** المنتجات المنشأة تلقائياً بانتظار التصنيف/الدمج */
adminRouter.get('/auto-created', async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.status, 'auto_created'))
      .orderBy(desc(schema.products.id))
      .limit(200);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** طلبات المستخدمين لمنتجات مفقودة */
adminRouter.get('/product-requests', async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(schema.productRequests)
      .orderBy(desc(schema.productRequests.createdAt))
      .limit(200);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/** ربط تصنيفات المتجر بتصنيفاتنا (قابل للتحرير من الأدمن) */
adminRouter.get('/category-mappings', async (_req, res, next) => {
  try {
    res.json(await db.select().from(schema.categoryMappings).orderBy(schema.categoryMappings.storeId));
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/category-mappings/:id', async (req, res, next) => {
  try {
    const body = z.object({ categoryId: z.number().int().nullable() }).parse(req.body);
    const [row] = await db
      .update(schema.categoryMappings)
      .set({ categoryId: body.categoryId })
      .where(eq(schema.categoryMappings.id, Number(req.params.id)))
      .returning();
    if (!row) return res.status(404).json({ error: 'الربط غير موجود' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

/** لوحة جودة البيانات: KPI الدقة + SLA قائمة المراجعة (القسمان 5-E و15) */
adminRouter.get('/dashboard', async (_req, res, next) => {
  try {
    const kpi = await accuracyKpi();
    const allCities = await db.select().from(schema.cities);
    const perCity = await Promise.all(
      allCities.map(async (c) => ({ city: c.nameAr, ...(await accuracyKpi(c.id)) })),
    );
    const pendingReview = await db.execute(sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '1 day')::int AS overdue
      FROM offers_review_queue WHERE status = 'pending'
    `);
    const kpiHistory = await db
      .select()
      .from(schema.kpiSnapshots)
      .orderBy(desc(schema.kpiSnapshots.day))
      .limit(60);
    res.json({
      kpi,
      perCity,
      reviewQueue: pendingReview.rows[0],
      kpiHistory,
    });
  } catch (err) {
    next(err);
  }
});
