// لوحة الإدارة (القسم 5-E + أقسام الملحق 13 و15)

import { Router } from 'express';
import multer from 'multer';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { adminRequired } from '../middleware/auth.js';
import { normalizeArabic } from '../services/normalize.js';
import { submitPrice, accuracyKpi } from '../services/priceResolver.js';
import { parseFlyerText } from '../services/ocr/flyerParser.js';
import { matchProduct } from '../services/productMatcher.js';
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
    if (!text && req.file) {
      const { ocrImage } = await import('../services/ocr/engine.js');
      text = await ocrImage(req.file.buffer);
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
      })
      .returning({ id: schema.prices.id });

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
