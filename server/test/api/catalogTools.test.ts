// سبرنت v2: بحث المرادفات عبر API، الإنشاء التلقائي، أداة الدمج، إثبات السعر

import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../../src/app.js';
import { db, schema } from '../../src/db/index.js';
import { normalizeArabic } from '../../src/services/normalize.js';
import { autoCreateProduct, mergeProducts } from '../../src/services/productMatcher.js';
import { ensureSynonyms } from '../../src/seed/index.js';
import { addEvidence } from '../../src/services/evidence.js';
import { resetDb, seedBasics, registerUser, makeAdmin, insertPrice, type Fixture } from './helpers.js';

const app = createApp();
let fx: Fixture;
let userCookie: string;
let adminCookie: string;

beforeAll(async () => {
  await resetDb();
  fx = await seedBasics();
  await ensureSynonyms();
  ({ cookie: userCookie } = await registerUser(app, { email: 'tools@test.sa' }));
  await request(app).patch('/api/auth/me').set('Cookie', userCookie).send({ cityId: fx.cityId });
  await registerUser(app, { email: 'toolsadmin@test.sa' });
  adminCookie = await makeAdmin(app, 'toolsadmin@test.sa');

  // منتج "روب" + سعر له
  const [rob] = await db
    .insert(schema.products)
    .values({
      nameAr: 'روب نادك كامل الدسم 170 جم',
      normalizedName: normalizeArabic('روب نادك كامل الدسم 170 جم'),
      brand: 'نادك',
      categoryId: fx.categoryId,
    })
    .returning();
  await insertPrice({ productId: rob!.id, branchId: fx.branchId, price: 3.25 });
});

describe('بحث المرادفات (جزء 4)', () => {
  it('"زبادي" يعيد منتجات الروب', async () => {
    const res = await request(app)
      .get(`/api/products?cityId=${fx.cityId}&q=${encodeURIComponent('زبادي')}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].nameAr).toContain('روب');
  });

  it('البحث بالعلامة اللاتينية يجد العربية', async () => {
    const res = await request(app)
      .get(`/api/products?cityId=${fx.cityId}&q=nadec`)
      .expect(200);
    expect(res.body.some((p: { brand: string }) => p.brand === 'نادك')).toBe(true);
  });
});

describe('الإنشاء التلقائي والدمج (جزء 1.2)', () => {
  it('منتج خام غير مطابق يُنشأ بحالة auto_created مع حجم مستخرج', async () => {
    const created = await autoCreateProduct({
      rawName: 'عصير تفاح العائلة الذهبي 1.5 لتر',
      storeId: fx.storeId,
      storeCategoryPath: 'مشروبات > عصائر',
    });
    const product = await db.query.products.findFirst({
      where: eq(schema.products.id, created.productId),
    });
    expect(product!.status).toBe('auto_created');
    expect(Number(product!.sizeValue)).toBe(1.5);
    expect(product!.sizeUnit).toBe('لتر');
    // مسار تصنيف المتجر سُجّل للأدمن
    const mapping = await db.query.categoryMappings.findFirst({
      where: eq(schema.categoryMappings.storeCategoryPath, 'مشروبات > عصائر'),
    });
    expect(mapping).toBeTruthy();
  });

  it('الدمج ينقل الأسعار والأسماء ويبقي أثراً تدقيقياً', async () => {
    const dup = await autoCreateProduct({ rawName: 'ارز ابو كاس بسمتي 5kg جديد', storeId: fx.storeId });
    await insertPrice({ productId: dup.productId, branchId: fx.branchId, price: 51.0 });

    const moved = await mergeProducts(dup.productId, fx.productId);
    expect(moved.prices).toBe(1);

    const source = await db.query.products.findFirst({
      where: eq(schema.products.id, dup.productId),
    });
    expect(source!.status).toBe('merged');
    expect(source!.mergedInto).toBe(fx.productId);

    // السعر المنقول يظهر الآن على المنتج الهدف
    const prices = await db
      .select()
      .from(schema.prices)
      .where(eq(schema.prices.productId, fx.productId));
    expect(prices.some((p) => Number(p.price) === 51.0)).toBe(true);

    // المدموج لا يظهر في البحث
    const res = await request(app)
      .get(`/api/products?cityId=${fx.cityId}&q=${encodeURIComponent('ارز ابو كاس')}`)
      .expect(200);
    expect(res.body.every((p: { id: number }) => p.id !== dup.productId)).toBe(true);
  });

  it('نقطة الدمج للأدمن محمية وتعمل', async () => {
    const dup2 = await autoCreateProduct({ rawName: 'زيت عافيه نسخة مكررة 1.5 لتر', storeId: fx.storeId });
    await request(app)
      .post(`/api/admin/products/${dup2.productId}/merge`)
      .set('Cookie', userCookie)
      .send({ targetId: fx.product2Id })
      .expect(403);
    const res = await request(app)
      .post(`/api/admin/products/${dup2.productId}/merge`)
      .set('Cookie', adminCookie)
      .send({ targetId: fx.product2Id })
      .expect(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('إثبات السعر (جزء 2)', () => {
  it('سعر بدليل يظهر عبر GET /prices/:id/evidence مع رابط المصدر', async () => {
    const price = await insertPrice({ productId: fx.productId, branchId: fx.branchId, price: 52.0 });
    await addEvidence({
      priceId: price.id,
      evidenceType: 'product_image',
      imagePath: null,
      sourceUrl: 'https://www.panda.com.sa/p/abukass-5kg',
    });
    const res = await request(app)
      .get(`/api/prices/${price.id}/evidence`)
      .set('Cookie', userCookie)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].sourceUrl).toContain('panda.com.sa');
    expect(res.body[0].evidenceType).toBe('product_image');
  });

  it('تقرير التغطية متاح للأدمن', async () => {
    const res = await request(app).get('/api/admin/coverage').set('Cookie', adminCookie).expect(200);
    expect(Array.isArray(res.body.stores)).toBe(true);
    const panda = res.body.stores.find((s: { name_ar: string }) => s.name_ar === 'بنده');
    expect(panda.products_with_price).toBeGreaterThanOrEqual(1);
  });

  it('طلب منتج مفقود يصل للأدمن', async () => {
    await request(app)
      .post('/api/product-requests')
      .set('Cookie', userCookie)
      .send({ query: 'جبن حلوم قبرصي' })
      .expect(201);
    const res = await request(app)
      .get('/api/admin/product-requests')
      .set('Cookie', adminCookie)
      .expect(200);
    expect(res.body.some((r: { query: string }) => r.query.includes('حلوم'))).toBe(true);
  });
});
