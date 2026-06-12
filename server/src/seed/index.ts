// بذر قاعدة البيانات ببيانات واقعية قابلة للاختبار (القسم 8)
// idempotent: يفرّغ الجداول ثم يعيد البناء — آمن لإعادة التشغيل

import bcrypt from 'bcrypt';
import { db, pool, schema } from '../db/index.js';
import { runMigrations } from '../db/migrate.js';
import { normalizeArabic } from '../services/normalize.js';
import { CITIES, STORES, BRANCHES } from './geo.js';
import { CATEGORIES } from './categories.js';
import { PRODUCTS } from './products.js';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysAhead = (n: number) => new Date(Date.now() + n * DAY);

// عشوائية حتمية (mulberry32) — نفس البذرة تعطي نفس البيانات في كل تشغيل
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260612);
const round2 = (n: number) => Math.round(n * 100) / 100;

async function wipe() {
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

async function main() {
  await runMigrations();
  await wipe();

  // 1) مدن
  const cityRows = await db.insert(schema.cities).values(CITIES).returning();
  const cityByCode = new Map(cityRows.map((c) => [c.code, c]));

  // 2) متاجر وفروع
  const storeRows = await db.insert(schema.stores).values(STORES).returning();
  const storeBySlug = new Map(storeRows.map((s) => [s.slug, s]));
  const branchRows = await db
    .insert(schema.storeBranches)
    .values(
      BRANCHES.map((b) => ({
        storeId: storeBySlug.get(b.store)!.id,
        cityId: cityByCode.get(b.city)!.id,
        nameAr: b.nameAr,
        address: b.address,
        lat: b.lat,
        lng: b.lng,
        isActive: true,
      })),
    )
    .returning();

  // 3) تصنيفات بمستويين
  let subCount = 0;
  const catBySlug = new Map<string, number>();
  for (const [i, main] of CATEGORIES.entries()) {
    const [m] = await db
      .insert(schema.categories)
      .values({ nameAr: main.nameAr, slug: main.slug, icon: main.icon, sortOrder: i })
      .returning();
    catBySlug.set(main.slug, m!.id);
    const subs = await db
      .insert(schema.categories)
      .values(
        main.subs.map((s, j) => ({
          parentId: m!.id,
          nameAr: s.nameAr,
          slug: s.slug,
          sortOrder: j,
        })),
      )
      .returning();
    for (const s of subs) catBySlug.set(s.slug, s.id);
    subCount += subs.length;
  }

  // 4) منتجات
  const productRows = await db
    .insert(schema.products)
    .values(
      PRODUCTS.map(([nameAr, brand, sizeValue, sizeUnit, catSlug]) => ({
        nameAr,
        normalizedName: normalizeArabic(nameAr),
        brand,
        sizeValue: String(sizeValue),
        sizeUnit,
        categoryId: catBySlug.get(catSlug)!,
      })),
    )
    .returning();

  // 5) أسعار حالية: كل منتج في 3–5 سلاسل، في فروع مكة وجدة
  const chainSlugs = ['panda', 'othaim', 'danube', 'carrefour', 'tamimi', 'baraka'];
  const priceValues: (typeof schema.prices.$inferInsert)[] = [];
  const storeFactor = new Map<string, number>([
    ['panda', 1.0],
    ['othaim', 0.97],
    ['danube', 1.06],
    ['carrefour', 0.99],
    ['tamimi', 1.09],
    ['baraka', 1.04],
  ]);

  for (const [i, p] of productRows.entries()) {
    const base = PRODUCTS[i]![5];
    // اختر 3–5 سلاسل حتمياً
    const count = 3 + Math.floor(rand() * 3);
    const shuffled = [...chainSlugs].sort(() => rand() - 0.5).slice(0, count);
    const offerStore = i % 8 === 0 ? shuffled[0] : null; // ~20 منتجاً عليها عرض ساري

    for (const slug of shuffled) {
      const store = storeBySlug.get(slug)!;
      const branches = branchRows.filter((b) => b.storeId === store.id);
      const chainPrice = round2(base * storeFactor.get(slug)! * (0.97 + rand() * 0.06));
      for (const branch of branches) {
        const ageDays = i % 23 === 0 ? 20 + Math.floor(rand() * 10) : Math.floor(rand() * 6);
        priceValues.push({
          productId: p.id,
          branchId: branch.id,
          price: String(chainPrice),
          source: 'scrape',
          basis: 'online',
          confidence: 80,
          lastVerifiedAt: daysAgo(ageDays),
          createdAt: daysAgo(ageDays),
        });
        // عرض ساري من مجلة معتمدة (قسم 14.1)
        if (slug === offerStore) {
          priceValues.push({
            productId: p.id,
            branchId: branch.id,
            price: String(round2(chainPrice * 0.8)),
            source: 'flyer_ocr_verified',
            basis: 'shelf',
            confidence: 95,
            isOffer: true,
            offerEndsAt: daysAhead(3 + Math.floor(rand() * 3)),
            lastVerifiedAt: daysAgo(1),
            createdAt: daysAgo(1),
          });
        }
        // ~30 منتجاً لها سعر رف موثق حديث
        if (i % 6 === 0 && slug === shuffled[1]) {
          priceValues.push({
            productId: p.id,
            branchId: branch.id,
            price: String(round2(chainPrice * 0.96)),
            source: i % 12 === 0 ? 'receipt_ocr' : 'user_report',
            basis: 'shelf',
            confidence: i % 12 === 0 ? 99 : 90,
            lastVerifiedAt: daysAgo(Math.floor(rand() * 3)),
            createdAt: daysAgo(Math.floor(rand() * 3)),
          });
        }
      }
    }

    // 6) تاريخ 3 أشهر لأول 30 منتجاً (أسبوعي)
    if (i < 30) {
      const store = storeBySlug.get(shuffled[0]!)!;
      const branch = branchRows.find((b) => b.storeId === store.id)!;
      for (let w = 13; w >= 1; w--) {
        priceValues.push({
          productId: p.id,
          branchId: branch.id,
          price: String(round2(base * (0.95 + rand() * 0.1))),
          source: 'scrape',
          basis: 'online',
          confidence: 0, // تاريخ مؤرشف — لا يُعرض
          lastVerifiedAt: daysAgo(w * 7),
          createdAt: daysAgo(w * 7),
        });
      }
    }

    // 7) نمط عروض متكرر في الأسبوع الأول من الشهر — لكشف أفضل وقت (قسم 6.4)
    if (i < 5) {
      const store = storeBySlug.get('othaim')!;
      const branch = branchRows.find((b) => b.storeId === store.id)!;
      const now = new Date();
      for (let m = 1; m <= 4; m++) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 3 + Math.floor(rand() * 4));
        priceValues.push({
          productId: p.id,
          branchId: branch.id,
          price: String(round2(base * 0.78)),
          source: 'flyer_ocr_verified',
          basis: 'shelf',
          confidence: 0, // عرض سابق منتهٍ
          isOffer: true,
          offerEndsAt: new Date(d.getTime() + 7 * DAY),
          lastVerifiedAt: d,
          createdAt: d,
        });
      }
    }
  }
  // إدخال على دفعات
  for (let i = 0; i < priceValues.length; i += 500) {
    await db.insert(schema.prices).values(priceValues.slice(i, i + 500));
  }

  // 8) مستخدمان
  const makkah = cityByCode.get('makkah')!;
  const [demo] = await db
    .insert(schema.users)
    .values({
      email: 'demo@waffir.app',
      passwordHash: await bcrypt.hash('Demo1234!', 12),
      name: 'مستخدم تجريبي',
      role: 'user',
      cityId: makkah.id,
      shoppingDay: 4,
    })
    .returning();
  await db.insert(schema.users).values({
    email: 'admin@waffir.app',
    passwordHash: await bcrypt.hash('Admin1234!', 12),
    name: 'مدير وفّر',
    role: 'admin',
    cityId: makkah.id,
    shoppingDay: 4,
  });

  // 9) تاريخ شراء 3 أشهر للمستخدم التجريبي (~15 منتجاً شهرياً)
  const pandaMakkah = branchRows.find(
    (b) => b.storeId === storeBySlug.get('panda')!.id && b.cityId === makkah.id,
  )!;
  const othaimMakkah = branchRows.find(
    (b) => b.storeId === storeBySlug.get('othaim')!.id && b.cityId === makkah.id,
  )!;
  const demoProducts = productRows.filter((_, i) => i % 11 === 0).slice(0, 15);
  const purchaseValues: (typeof schema.purchases.$inferInsert)[] = [];
  for (const [j, p] of demoProducts.entries()) {
    const basePrice = PRODUCTS[productRows.indexOf(p)]![5];
    for (const monthsBack of [3, 2, 1]) {
      const jitter = Math.floor(rand() * 5) - 2;
      purchaseValues.push({
        userId: demo!.id,
        productId: p.id,
        branchId: j % 2 === 0 ? pandaMakkah.id : othaimMakkah.id,
        quantity: String(1 + (j % 3 === 0 ? 1 : 0)),
        price: String(round2(basePrice * (0.95 + rand() * 0.1))),
        purchasedAt: daysAgo(monthsBack * 30 + jitter),
      });
    }
  }
  await db.insert(schema.purchases).values(purchaseValues);

  // 10) قائمة الشهر الماضي مكتملة
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const monthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  const [doneList] = await db
    .insert(schema.shoppingLists)
    .values({
      userId: demo!.id,
      title: `القائمة الشهرية — ${monthStr}`,
      month: monthStr,
      status: 'completed',
      createdAt: daysAgo(33),
    })
    .returning();
  await db.insert(schema.listItems).values(
    demoProducts.slice(0, 10).map((p, j) => ({
      listId: doneList!.id,
      productId: p.id,
      quantity: '1',
      chosenBranchId: j % 2 === 0 ? pandaMakkah.id : othaimMakkah.id,
      expectedPrice: String(PRODUCTS[productRows.indexOf(p)]![5]),
      actualPrice: String(round2(PRODUCTS[productRows.indexOf(p)]![5] * 0.98)),
      isPurchased: true,
      purchasedAt: daysAgo(30),
    })),
  );

  // 11) ملفات المصادر (قسم 13.2) + معايرة بنده
  const profiles: (typeof schema.storeSourceProfiles.$inferInsert)[] = [
    {
      storeId: storeBySlug.get('panda')!.id,
      sourceType: 'web_catalog',
      endpointOrUrl: 'https://www.panda.com.sa',
      priceBasis: 'online',
      priority: 1,
      isConfirmed: true,
      lastSuccessAt: daysAgo(0),
    },
    {
      storeId: storeBySlug.get('panda')!.id,
      sourceType: 'flyer',
      endpointOrUrl: 'https://www.panda.com.sa/offers',
      priceBasis: 'shelf',
      priority: 2,
      isConfirmed: true,
      lastSuccessAt: daysAgo(0),
      learnedPublishWeekday: 4, // الخميس
    },
    {
      storeId: storeBySlug.get('othaim')!.id,
      sourceType: 'flyer',
      endpointOrUrl: 'https://www.othaimmarkets.com/offers',
      priceBasis: 'shelf',
      priority: 1,
      isConfirmed: true,
      lastSuccessAt: daysAgo(1),
      learnedPublishWeekday: 3, // الأربعاء
    },
    {
      storeId: storeBySlug.get('baraka')!.id,
      sourceType: 'user_only',
      priceBasis: 'shelf',
      priority: 1,
      isConfirmed: true,
    },
  ];
  await db.insert(schema.storeSourceProfiles).values(profiles);
  await db.insert(schema.chainCalibrations).values({
    storeId: storeBySlug.get('panda')!.id,
    factor: 0.95,
    sampleCount: 8,
  });

  // 12) أسماء خام (aliases) لـ20 منتجاً — مطابقة الكتالوجات والفواتير
  const aliasValues: (typeof schema.productAliases.$inferInsert)[] = [];
  for (const [i, p] of productRows.slice(0, 20).entries()) {
    aliasValues.push({
      productId: p.id,
      storeId: storeBySlug.get(i % 2 === 0 ? 'panda' : 'othaim')!.id,
      rawName: p.nameAr.replace(/كجم/, 'kg').replace(/لتر/, 'L').replace(/أ/g, 'ا'),
    });
  }
  await db.insert(schema.productAliases).values(aliasValues);

  // إحصاءات
  const counts = {
    cities: cityRows.length,
    stores: storeRows.length,
    branches: branchRows.length,
    mains: CATEGORIES.length,
    subs: subCount,
    products: productRows.length,
    prices: priceValues.length,
    purchases: purchaseValues.length,
  };
  console.log('✓ البذر اكتمل:', JSON.stringify(counts, null, 1));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
