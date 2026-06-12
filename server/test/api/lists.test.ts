import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../../src/app.js';
import { db, schema } from '../../src/db/index.js';
import { resetDb, seedBasics, registerUser, insertPrice, type Fixture } from './helpers.js';

const app = createApp();
let fx: Fixture;
let cookie: string;

beforeAll(async () => {
  await resetDb();
  fx = await seedBasics();
  ({ cookie } = await registerUser(app, { email: 'list@test.sa' }));
  await request(app).patch('/api/auth/me').set('Cookie', cookie).send({ cityId: fx.cityId });
  await insertPrice({ productId: fx.productId, branchId: fx.branchId, price: 50.0, source: 'user_report', confidence: 90 });
  await insertPrice({ productId: fx.productId, branchId: fx.branch2Id, price: 52.0 });
  await insertPrice({ productId: fx.product2Id, branchId: fx.branchId, price: 24.0 });
});

describe('القوائم ووضع التسوق', () => {
  let listId: number;
  let itemId: number;

  it('إنشاء قائمة وإضافة عنصر يختار الأرخص تلقائياً', async () => {
    const list = await request(app)
      .post('/api/lists')
      .set('Cookie', cookie)
      .send({ title: 'قائمتي' })
      .expect(201);
    listId = list.body.id;

    const item = await request(app)
      .post(`/api/lists/${listId}/items`)
      .set('Cookie', cookie)
      .send({ productId: fx.productId, quantity: 2 })
      .expect(201);
    itemId = item.body.id;
    expect(item.body.chosenBranchId).toBe(fx.branchId); // الأرخص 50.0
    expect(Number(item.body.expectedPrice)).toBe(50);
  });

  it('تفاصيل القائمة تشمل ملخص التحسين', async () => {
    await request(app)
      .post(`/api/lists/${listId}/items`)
      .set('Cookie', cookie)
      .send({ productId: fx.product2Id, quantity: 1 })
      .expect(201);
    const res = await request(app).get(`/api/lists/${listId}`).set('Cookie', cookie).expect(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.optimization.bestSingleStore).toBeTruthy();
    expect(res.body.optimization.bestSingleStore.total).toBe(124); // 50×2 + 24
  });

  it('شطب عنصر مع سعر فعلي يكتب price_report بثقة 90', async () => {
    const res = await request(app)
      .patch(`/api/lists/${listId}/items/${itemId}`)
      .set('Cookie', cookie)
      .send({ isPurchased: true, actualPrice: 51.5 })
      .expect(200);
    expect(res.body.item.isPurchased).toBe(true);
    expect(res.body.priceReport.status).toBe('published');

    const reports = await db
      .select()
      .from(schema.prices)
      .where(eq(schema.prices.source, 'user_report'));
    const mine = reports.find((r) => Number(r.price) === 51.5);
    expect(mine).toBeTruthy();
    expect(mine!.confidence).toBe(90);
    expect(mine!.branchId).toBe(fx.branchId);
  });

  it('إنهاء التسوق يكتب purchases ويعيد ملخص التوفير', async () => {
    const res = await request(app).post(`/api/lists/${listId}/finish`).set('Cookie', cookie).expect(200);
    expect(res.body.purchasedCount).toBe(1);
    expect(res.body.skippedCount).toBe(1);
    expect(res.body.expectedTotal).toBe(100); // 50×2
    expect(res.body.actualTotal).toBe(103); // 51.5×2
    const purchases = await db.select().from(schema.purchases);
    expect(purchases).toHaveLength(1);
    expect(purchases[0]!.productId).toBe(fx.productId);
  });

  it('قائمة مستخدم آخر → 404', async () => {
    const { cookie: other } = await registerUser(app, { email: 'other@test.sa' });
    await request(app).get(`/api/lists/${listId}`).set('Cookie', other).expect(404);
  });
});

describe('توليد القائمة الشهرية من تاريخ الشراء', () => {
  it('تاريخ 3 أشهر يولّد قائمة بعناصر مستحقة', async () => {
    const { cookie: c2, user } = await registerUser(app, { email: 'monthly@test.sa' });
    await request(app)
      .patch('/api/auth/me')
      .set('Cookie', c2)
      .send({ cityId: fx.cityId, shoppingDay: new Date(Date.now() + 4 * 86_400_000).getDate() });
    // ثلاث مشتريات شهرية للأرز
    for (const monthsBack of [3, 2, 1]) {
      await db.insert(schema.purchases).values({
        userId: user.id,
        productId: fx.productId,
        branchId: fx.branchId,
        quantity: '1',
        price: '50',
        purchasedAt: new Date(Date.now() - monthsBack * 30 * 86_400_000),
      });
    }
    const res = await request(app).post('/api/lists/generate-monthly').set('Cookie', c2).expect(201);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].productId).toBe(fx.productId);
    expect(res.body.items[0].chosenBranchId).toBe(fx.branchId);
  });

  it('بلا تاريخ شراء → 422', async () => {
    const { cookie: c3 } = await registerUser(app, { email: 'empty@test.sa' });
    await request(app).post('/api/lists/generate-monthly').set('Cookie', c3).expect(422);
  });
});
