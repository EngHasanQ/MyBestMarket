import type { Express } from 'express';
import request from 'supertest';
import { db, schema } from '../../src/db/index.js';
import { normalizeArabic } from '../../src/services/normalize.js';

/** تفريغ كل الجداول بترتيب FKs الصحيح قبل كل ملف اختبار */
export async function resetDb() {
  await db.delete(schema.priceEvidence);
  await db.delete(schema.productRequests);
  await db.delete(schema.categoryMappings);
  await db.delete(schema.searchSynonyms);
  await db.delete(schema.kpiSnapshots);
  await db.delete(schema.jobRuns);
  await db.delete(schema.chainCalibrations);
  await db.delete(schema.storeSourceProfiles);
  await db.delete(schema.discoveredPlaces);
  await db.delete(schema.notifications);
  await db.delete(schema.priceAlerts);
  await db.delete(schema.purchases);
  await db.delete(schema.listItems);
  await db.delete(schema.shoppingLists);
  await db.delete(schema.offersReviewQueue);
  await db.delete(schema.prices);
  await db.delete(schema.productAliases);
  await db.delete(schema.products);
  await db.delete(schema.categories);
  await db.delete(schema.storeBranches);
  await db.delete(schema.stores);
  await db.delete(schema.users);
  await db.delete(schema.cities);
}

export interface Fixture {
  cityId: number;
  city2Id: number;
  storeId: number; // بنده
  store2Id: number; // العثيم
  branchId: number; // بنده مكة
  branch2Id: number; // العثيم مكة
  branchOtherCityId: number; // بنده جدة
  categoryId: number;
  productId: number; // أرز أبو كاس
  product2Id: number; // زيت عافية
}

/** بيانات أساس مشتركة: مدينتان، متجران، 3 فروع، تصنيف، منتجان */
export async function seedBasics(): Promise<Fixture> {
  const [makkah, jeddah] = await db
    .insert(schema.cities)
    .values([
      { nameAr: 'مكة المكرمة', code: 'makkah', lat: 21.42, lng: 39.83 },
      { nameAr: 'جدة', code: 'jeddah', lat: 21.49, lng: 39.19 },
    ])
    .returning();
  const [panda, othaim] = await db
    .insert(schema.stores)
    .values([
      { nameAr: 'بنده', slug: 'panda', type: 'supermarket' },
      { nameAr: 'العثيم', slug: 'othaim', type: 'supermarket' },
    ])
    .returning();
  const [b1, b2, b3] = await db
    .insert(schema.storeBranches)
    .values([
      { storeId: panda!.id, cityId: makkah!.id, nameAr: 'بنده العزيزية', isActive: true },
      { storeId: othaim!.id, cityId: makkah!.id, nameAr: 'العثيم الششة', isActive: true },
      { storeId: panda!.id, cityId: jeddah!.id, nameAr: 'بنده الروضة', isActive: true },
    ])
    .returning();
  const [cat] = await db
    .insert(schema.categories)
    .values({ nameAr: 'مواد غذائية أساسية', slug: 'staples', sortOrder: 1 })
    .returning();
  const [rice, oil] = await db
    .insert(schema.products)
    .values([
      {
        nameAr: 'أرز أبو كاس بسمتي 5 كجم',
        normalizedName: normalizeArabic('أرز أبو كاس بسمتي 5 كجم'),
        brand: 'أبو كاس',
        categoryId: cat!.id,
      },
      {
        nameAr: 'زيت عافية 1.5 لتر',
        normalizedName: normalizeArabic('زيت عافية 1.5 لتر'),
        brand: 'عافية',
        categoryId: cat!.id,
      },
    ])
    .returning();
  return {
    cityId: makkah!.id,
    city2Id: jeddah!.id,
    storeId: panda!.id,
    store2Id: othaim!.id,
    branchId: b1!.id,
    branch2Id: b2!.id,
    branchOtherCityId: b3!.id,
    categoryId: cat!.id,
    productId: rice!.id,
    product2Id: oil!.id,
  };
}

export async function registerUser(
  app: Express,
  over: Partial<{ email: string; name: string; cityId: number; shoppingDay: number }> = {},
) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      email: over.email ?? 'user@test.sa',
      password: 'Password1!',
      name: over.name ?? 'مستخدم اختبار',
      cityId: over.cityId,
      shoppingDay: over.shoppingDay,
    })
    .expect(201);
  const cookie = res.headers['set-cookie']![0]!;
  return { user: res.body as { id: number }, cookie };
}

/** ترقية مستخدم لأدمن مباشرة في القاعدة ثم تسجيل دخول جديد لتحديث الدور في التوكن */
export async function makeAdmin(app: Express, email: string) {
  const { eq } = await import('drizzle-orm');
  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.email, email));
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'Password1!' })
    .expect(200);
  return res.headers['set-cookie']![0]!;
}

export async function insertPrice(over: {
  productId: number;
  branchId: number;
  price: number;
  source?: 'api' | 'scrape' | 'flyer_ocr_verified' | 'user_report' | 'receipt_ocr' | 'manual_admin';
  basis?: 'shelf' | 'online' | 'unknown';
  confidence?: number;
  isOffer?: boolean;
  offerEndsAt?: Date | null;
  lastVerifiedAt?: Date;
}) {
  const [row] = await db
    .insert(schema.prices)
    .values({
      productId: over.productId,
      branchId: over.branchId,
      price: String(over.price),
      source: over.source ?? 'scrape',
      basis: over.basis ?? 'shelf',
      confidence: over.confidence ?? 80,
      isOffer: over.isOffer ?? false,
      offerEndsAt: over.offerEndsAt ?? null,
      lastVerifiedAt: over.lastVerifiedAt ?? new Date(),
      createdAt: over.lastVerifiedAt ?? new Date(),
    })
    .returning();
  return row!;
}
