// A1 — حجر البيانات التجريبية:
// عندما يكون SHOW_DEMO_DATA مُطفأً، الكتالوج يعرض فقط البيانات الحقيقية المستوردة.
// منتج بسعر تجريبي فقط يختفي؛ منتج له سعر حقيقي يبقى ويظهر سعره الحقيقي.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { config } from '../../src/config.js';
import { resetDb, seedBasics, insertPrice, type Fixture } from './helpers.js';

const app = createApp();
let fx: Fixture;
const originalShowDemo = config.showDemoData;

beforeAll(async () => {
  await resetDb();
  fx = await seedBasics();
  // الأرز: سعر تجريبي فقط (بذر) — يجب أن يختفي عند إطفاء العرض التجريبي
  await insertPrice({
    productId: fx.productId,
    branchId: fx.branchId,
    price: 52.95,
    source: 'scrape',
    basis: 'online',
    isDemo: true,
  });
  // الزيت: سعر حقيقي مستورد (مجلة معتمدة) — يجب أن يبقى دائماً
  await insertPrice({
    productId: fx.product2Id,
    branchId: fx.branch2Id,
    price: 18.5,
    source: 'flyer_ocr_verified',
    confidence: 95,
    isDemo: false,
  });
});

afterAll(() => {
  config.showDemoData = originalShowDemo;
});

describe('A1 حجر البيانات التجريبية', () => {
  it('SHOW_DEMO_DATA مُفعَّل: يظهر المنتجان (تجريبي + حقيقي)', async () => {
    config.showDemoData = true;
    const res = await request(app)
      .get(`/api/products?cityId=${fx.cityId}&categoryId=${fx.categoryId}`)
      .expect(200);
    const ids = res.body.map((p: { id: number }) => p.id);
    expect(ids).toContain(fx.productId);
    expect(ids).toContain(fx.product2Id);
  });

  it('SHOW_DEMO_DATA مُطفأً: يختفي المنتج التجريبي ويبقى الحقيقي فقط', async () => {
    config.showDemoData = false;
    const res = await request(app)
      .get(`/api/products?cityId=${fx.cityId}&categoryId=${fx.categoryId}`)
      .expect(200);
    const ids = res.body.map((p: { id: number }) => p.id);
    expect(ids).not.toContain(fx.productId); // تجريبي → مخفي
    expect(ids).toContain(fx.product2Id); // حقيقي → ظاهر
    const oil = res.body.find((p: { id: number }) => p.id === fx.product2Id);
    expect(oil.cheapest.price).toBe(18.5);
  });

  it('SHOW_DEMO_DATA مُطفأً: مدينة بلا بيانات حقيقية → كتالوج فارغ (حالة فارغة صادقة)', async () => {
    config.showDemoData = false;
    // جدة (city2) ليس بها أي سعر حقيقي
    const res = await request(app)
      .get(`/api/products?cityId=${fx.city2Id}&categoryId=${fx.categoryId}`)
      .expect(200);
    expect(res.body).toHaveLength(0);
  });

  it('SHOW_DEMO_DATA مُطفأً: البحث لا يُرجع منتجاً تجريبياً', async () => {
    config.showDemoData = false;
    const res = await request(app)
      .get(`/api/products?cityId=${fx.cityId}&q=${encodeURIComponent('ارز ابوكاس')}`)
      .expect(200);
    const ids = res.body.map((p: { id: number }) => p.id);
    expect(ids).not.toContain(fx.productId);
  });
});
