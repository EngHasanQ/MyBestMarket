// اختبارات الملحق §16: الاكتشاف، الفاتورة، الفروقات، انتهاء العروض، المعايرة

import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { createApp } from '../../src/app.js';
import { db, schema } from '../../src/db/index.js';
import { registerAllJobs, } from '../../src/jobs/index.js';
import { runJob } from '../../src/jobs/framework.js';
import { qualifyStore } from '../../src/services/sourceQualification.js';
import { submitPrice } from '../../src/services/priceResolver.js';
import { resetDb, seedBasics, registerUser, makeAdmin, insertPrice, type Fixture } from './helpers.js';

const app = createApp();
let fx: Fixture;
let adminCookie: string;
let userCookie: string;

beforeAll(async () => {
  registerAllJobs();
  await resetDb();
  fx = await seedBasics();
  ({ cookie: userCookie } = await registerUser(app, { email: 'pipe@test.sa', cityId: undefined }));
  await request(app).patch('/api/auth/me').set('Cookie', userCookie).send({ cityId: fx.cityId });
  await registerUser(app, { email: 'pipeadmin@test.sa' });
  adminCookie = await makeAdmin(app, 'pipeadmin@test.sa');
});

describe('§16.1 الاكتشاف وتأهيل المصادر', () => {
  const fixturePlaces = [
    { placeId: 'pl_m1', name: 'أسواق المرشدي - العزيزية', lat: 21.41, lng: 39.84, types: ['supermarket'], website: 'https://almurshidi.example.sa' },
    { placeId: 'pl_m2', name: 'أسواق المرشدي - الششة', lat: 21.43, lng: 39.85, types: ['supermarket'], website: 'https://almurshidi.example.sa' },
    { placeId: 'pl_m3', name: 'اسواق المرشدى فرع العوالي', lat: 21.39, lng: 39.8, types: ['grocery_store'], website: 'https://almurshidi.example.sa' },
    { placeId: 'pl_n1', name: 'بقالة النور', lat: 21.4, lng: 39.82, types: ['convenience_store'], website: null },
  ];

  let chainStoreId: number;

  it('الاكتشاف يجمع 3 فروع في سلسلة واحدة وبقالة مستقلة', async () => {
    const res = await request(app)
      .post('/api/admin/discovery/run')
      .set('Cookie', adminCookie)
      .send({ cityId: fx.cityId, fixturePlaces })
      .expect(200);
    expect(res.body.placesFound).toBe(4);
    expect(res.body.chains).toBe(2);
    expect(res.body.newStores).toBe(2);
    expect(res.body.newBranches).toBe(4);

    const places = await db.select().from(schema.discoveredPlaces);
    const chainIds = new Set(places.filter((p) => p.name.includes('المرشد')).map((p) => p.chainStoreId));
    expect(chainIds.size).toBe(1);
    chainStoreId = [...chainIds][0]!;
  });

  it('سلسلة بموقع فيه كتالوج+عروض تتأهل، وبقالة بلا موقع تُستبعد', async () => {
    // تأهيل بـ fixture HTML (سلة + صفحة عروض)
    const result = await qualifyStore(chainStoreId, {
      website: 'https://almurshidi.example.sa',
      fixtureHtml:
        '<html><script src="https://cdn.salla.network/x.js"></script><a href="/offers">العروض</a><div>أضف للسلة — السعر 10 ر.س</div></html>',
    });
    expect(result.sources.map((s) => s.sourceType).sort()).toEqual(['api', 'flyer', 'web_catalog']);

    const noorPlace = await db.query.discoveredPlaces.findFirst({
      where: eq(schema.discoveredPlaces.placeId, 'pl_n1'),
    });
    const noorStoreId = noorPlace!.chainStoreId!;
    const noorResult = await qualifyStore(noorStoreId, { website: null });
    expect(noorResult.sources).toHaveLength(0);
    const after = await db.query.discoveredPlaces.findFirst({
      where: eq(schema.discoveredPlaces.placeId, 'pl_n1'),
    });
    expect(after!.status).toBe('excluded_no_source');
  });

  it('المستبعَد بلا مصدر مخفي عن كتالوج المستخدم (فروعه غير نشطة)', async () => {
    const branches = await db
      .select()
      .from(schema.storeBranches)
      .where(eq(schema.storeBranches.isActive, false));
    expect(branches.length).toBe(4); // كل الفروع المكتشفة غير نشطة قبل التأكيد
  });

  it('تأكيد الأدمن للمصدر يفعّل فروع السلسلة', async () => {
    const profiles = await request(app).get('/api/admin/source-profiles').set('Cookie', adminCookie).expect(200);
    const flyerProfile = profiles.body.find(
      (p: { storeId: number; sourceType: string }) => p.storeId === chainStoreId && p.sourceType === 'flyer',
    );
    await request(app)
      .post(`/api/admin/source-profiles/${flyerProfile.id}/confirm`)
      .set('Cookie', adminCookie)
      .expect(200);
    const active = await db
      .select()
      .from(schema.storeBranches)
      .where(and(eq(schema.storeBranches.storeId, chainStoreId), eq(schema.storeBranches.isActive, true)));
    expect(active).toHaveLength(3);
  });

  it('إعادة تشغيل الاكتشاف بنفس البيانات لا تكرر متاجر ولا فروعاً (idempotent)', async () => {
    const res = await request(app)
      .post('/api/admin/discovery/run')
      .set('Cookie', adminCookie)
      .send({ cityId: fx.cityId, fixturePlaces })
      .expect(200);
    expect(res.body.newStores).toBe(0);
    expect(res.body.newBranches).toBe(0);
  });
});

describe('§16.2 مسار الفاتورة (receipt OCR)', () => {
  it('نص فاتورة → ≥80% مطابقة تلقائية → أسعار بثقة 99 وفرع صحيح', async () => {
    const ocrText = [
      'بنده العزيزية',
      '2026-06-10 19:05',
      'أرز أبو كاس بسمتي 5 كجم  52.95',
      'زيت عافية 1.5 لتر  24.75',
      'منتج غامض غير معروف  9.99',
      'الإجمالي  87.69',
    ].join('\n');
    const res = await request(app)
      .post('/api/receipt')
      .set('Cookie', userCookie)
      .send({ branchId: fx.branchId, ocrText })
      .expect(200);

    expect(res.body.matched.length).toBe(2);
    expect(res.body.unmatched.length).toBe(1);
    // ≥80% من الأسطر القابلة للمطابقة طُوبقت تلقائياً (2 من 2 معروفة)
    const verified = await db
      .select()
      .from(schema.prices)
      .where(eq(schema.prices.source, 'receipt_ocr'));
    expect(verified.length).toBe(2);
    for (const v of verified) {
      expect(v.confidence).toBe(99);
      expect(v.branchId).toBe(fx.branchId);
    }
  });

  it('تأكيد سطر غامض يكتب سعراً موثقاً وalias دائماً', async () => {
    await request(app)
      .post('/api/receipt/confirm-line')
      .set('Cookie', userCookie)
      .send({ branchId: fx.branchId, productId: fx.product2Id, rawName: 'منتج غامض غير معروف', price: 9.99 })
      .expect(201);
    const alias = await db.query.productAliases.findFirst({
      where: eq(schema.productAliases.rawName, 'منتج غامض غير معروف'),
    });
    expect(alias?.productId).toBe(fx.product2Id);
  });
});

describe('§16.3 خط التحديث اليومي', () => {
  it('catalog-refresh مرتان ببيانات متطابقة → التشغيل الثاني صفر صفوف جديدة', async () => {
    // اربط alias حتى يطابق fixture بنده المنتج
    await db.insert(schema.productAliases).values({
      productId: fx.productId,
      storeId: fx.storeId,
      rawName: 'ارز ابو كاس بسمتي 5kg',
    }).onConflictDoNothing();

    const r1 = await runJob('catalog-refresh');
    expect(r1.status).toBe('success');
    const countAfter1 = (await db.select().from(schema.prices)).length;
    expect(r1.itemsOut).toBeGreaterThan(0);

    const r2 = await runJob('catalog-refresh');
    expect(r2.status).toBe('success');
    expect(r2.itemsOut).toBe(0); // منطق الفروقات
    const countAfter2 = (await db.select().from(schema.prices)).length;
    expect(countAfter2).toBe(countAfter1);
  });

  it('offer-expiry: عرض منتهٍ يختفي من صفحة المنتج ومن الأرخص', async () => {
    await insertPrice({
      productId: fx.product2Id,
      branchId: fx.branch2Id,
      price: 5.0,
      source: 'flyer_ocr_verified',
      confidence: 95,
      isOffer: true,
      offerEndsAt: new Date(Date.now() - 3_600_000), // انتهى قبل ساعة
    });
    await insertPrice({ productId: fx.product2Id, branchId: fx.branch2Id, price: 22.0 });

    await runJob('offer-expiry');

    const res = await request(app)
      .get(`/api/products/${fx.product2Id}?cityId=${fx.cityId}`)
      .expect(200);
    const branch2 = res.body.comparisons.find(
      (c: { branchId: number }) => c.branchId === fx.branch2Id,
    );
    expect(branch2.price).toBe(22); // ليس 5.0 المنتهي
    expect(branch2.isOffer).toBe(false);
  });

  it('job_runs تسجل كل تشغيل للمراقبة', async () => {
    const runs = await request(app).get('/api/admin/job-runs').set('Cookie', adminCookie).expect(200);
    const jobs = runs.body.map((r: { job: string }) => r.job);
    expect(jobs).toContain('catalog-refresh');
    expect(jobs).toContain('offer-expiry');
    expect(runs.body.every((r: { status: string }) => r.status === 'success')).toBe(true);
  });
});

describe('§16.4 المعايرة إلكتروني→رف', () => {
  it('إلكتروني 12.0 + فاتورة 10.5 → سعر إلكتروني شقيق يُعرض معايَراً بوسم تقديري', async () => {
    // منتجان جديدان بلا تاريخ أسعار (حتى لا يتدخل حارس الشذوذ)
    const [calProduct, sibling] = await db
      .insert(schema.products)
      .values([
        {
          nameAr: 'عصير ربيع برتقال 1 لتر',
          normalizedName: 'عصير ربيع برتقال 1 لتر',
          categoryId: fx.categoryId,
        },
        {
          nameAr: 'شاي ليبتون 100 كيس',
          normalizedName: 'شاي ليبتون 100 كيس',
          categoryId: fx.categoryId,
        },
      ])
      .returning();

    // سعر إلكتروني ثم سعر رف من فاتورة لنفس المنتج → معامل ≈ 10.5/12
    await insertPrice({ productId: calProduct!.id, branchId: fx.branchId, price: 12.0, source: 'scrape', basis: 'online' });
    await submitPrice({
      productId: calProduct!.id,
      branchId: fx.branchId,
      price: 10.5,
      source: 'receipt_ocr',
      basis: 'shelf',
    });

    const cal = await db.query.chainCalibrations.findFirst({
      where: eq(schema.chainCalibrations.storeId, fx.storeId),
    });
    expect(cal).toBeTruthy();
    expect(cal!.factor).toBeLessThan(1);

    // الشقيق إلكتروني فقط 20.0 → يُعرض معايَراً ووسم estimated
    await insertPrice({ productId: sibling!.id, branchId: fx.branchId, price: 20.0, source: 'scrape', basis: 'online' });
    const res = await request(app)
      .get(`/api/products/${sibling!.id}?cityId=${fx.cityId}`)
      .expect(200);
    const comp = res.body.comparisons[0];
    expect(comp.estimated).toBe(true);
    expect(comp.price).toBeLessThan(20);
  });
});

describe('حارس الشذوذ (14.5)', () => {
  it('سعر منحرف >40% عن الوسيط يذهب للمراجعة لا للنشر', async () => {
    for (const p of [10, 10.5, 11]) {
      await insertPrice({ productId: fx.product2Id, branchId: fx.branchId, price: p });
    }
    const res = await request(app)
      .post('/api/report')
      .set('Cookie', userCookie)
      .send({ productId: fx.product2Id, branchId: fx.branchId, price: 99 })
      .expect(201);
    expect(res.body.status).toBe('queued_anomaly');

    const queue = await db
      .select()
      .from(schema.offersReviewQueue)
      .where(eq(schema.offersReviewQueue.kind, 'anomaly'));
    const mine = queue.filter(
      (q) => q.matchedProductId === fx.product2Id && Number(q.parsedPrice) === 99,
    );
    expect(mine).toHaveLength(1);

    // ولم يُنشر السعر الشاذ
    const published = await db
      .select()
      .from(schema.prices)
      .where(eq(schema.prices.productId, fx.product2Id));
    expect(published.some((p) => Number(p.price) === 99)).toBe(false);
  });
});
