import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { resetDb, seedBasics, insertPrice, type Fixture } from './helpers.js';

const app = createApp();
let fx: Fixture;

beforeAll(async () => {
  await resetDb();
  fx = await seedBasics();
  // مكة: بنده 52.95 (كشط) + العثيم 49.95 (مجلة سارية) — جدة: 54.00
  await insertPrice({ productId: fx.productId, branchId: fx.branchId, price: 52.95, source: 'scrape', basis: 'online' });
  await insertPrice({
    productId: fx.productId,
    branchId: fx.branch2Id,
    price: 49.95,
    source: 'flyer_ocr_verified',
    confidence: 95,
    isOffer: true,
    offerEndsAt: new Date(Date.now() + 3 * 86_400_000),
  });
  await insertPrice({ productId: fx.productId, branchId: fx.branchOtherCityId, price: 54.0 });
});

describe('الكتالوج المقيد بالمدينة', () => {
  it('قائمة المدن والتصنيفات', async () => {
    const cities = await request(app).get('/api/cities').expect(200);
    expect(cities.body).toHaveLength(2);
    const cats = await request(app).get('/api/categories').expect(200);
    expect(cats.body[0].nameAr).toBe('مواد غذائية أساسية');
  });

  it('البحث العربي المطبّع يجد المنتج (إملاء مختلف)', async () => {
    const res = await request(app)
      .get(`/api/products?cityId=${fx.cityId}&q=${encodeURIComponent('ارز ابوكاس')}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].nameAr).toContain('أبو كاس');
  });

  it('صفحة المنتج: مقارنة مرتبة بالأرخص ومقيدة بمدينة المستخدم', async () => {
    const res = await request(app)
      .get(`/api/products/${fx.productId}?cityId=${fx.cityId}`)
      .expect(200);
    const { comparisons } = res.body;
    expect(comparisons).toHaveLength(2); // فرع جدة لا يظهر
    expect(comparisons[0].price).toBe(49.95);
    expect(comparisons[0].isOffer).toBe(true);
    expect(comparisons[0].confidence).toBe(95);
    expect(comparisons[0].freshnessLabel).toBeTruthy(); // شارة الحداثة إلزامية
    expect(comparisons[1].price).toBe(52.95);
  });

  it('الأرخص في بطاقة المنتج يتجاهل القديم', async () => {
    // زيت عافية: سعر حديث 24 وسعر أرخص لكنه قديم 19
    await insertPrice({ productId: fx.product2Id, branchId: fx.branchId, price: 24.0 });
    await insertPrice({
      productId: fx.product2Id,
      branchId: fx.branch2Id,
      price: 19.0,
      lastVerifiedAt: new Date(Date.now() - 20 * 86_400_000),
    });
    const res = await request(app)
      .get(`/api/products?cityId=${fx.cityId}&q=${encodeURIComponent('زيت عافيه')}`)
      .expect(200);
    expect(res.body[0].cheapest.price).toBe(24);
  });

  it('cityId إلزامي', async () => {
    await request(app).get('/api/products').expect(400);
  });
});
