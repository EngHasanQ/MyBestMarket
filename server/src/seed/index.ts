// بذر قاعدة البيانات ببيانات واقعية قابلة للاختبار (القسم 8)
//
// وضعان:
//  - CLI (npm run seed): مسح كامل ثم إعادة بناء — idempotent
//  - bootstrap (عند إقلاع الخادم بقاعدة فارغة): إدراج بلا مسح أبداً،
//    كل قسم يُدرَج فقط إذا كان جدوله فارغاً، والحسابات الموجودة لا تُمس

import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
const round2 = (n: number) => Math.round(n * 100) / 100;

async function wipe() {
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

export interface SeedCounts {
  cities: number;
  stores: number;
  branches: number;
  mains: number;
  subs: number;
  products: number;
  prices: number;
  purchases: number;
}

/**
 * upsert مدن المملكة بالكامل حسب code — يضيف المدن الجديدة لقاعدة موجودة
 * دون المساس بالقائمة. يُستدعى عند كل إقلاع للخادم.
 */
export async function ensureCities() {
  await db
    .insert(schema.cities)
    .values(
      CITIES.map((c) => ({
        nameAr: c.nameAr,
        code: c.code,
        lat: c.lat,
        lng: c.lng,
        minLat: c.minLat ?? null,
        minLng: c.minLng ?? null,
        maxLat: c.maxLat ?? null,
        maxLng: c.maxLng ?? null,
      })),
    )
    .onConflictDoNothing({ target: schema.cities.code });
  return db.select().from(schema.cities);
}

/** تعبئة أيقونات التصنيفات الفرعية للقواعد المنشورة قبل إضافتها */
export async function ensureCategoryIcons() {
  const iconBySlug = new Map<string, string>();
  for (const main of CATEGORIES) {
    iconBySlug.set(main.slug, main.icon);
    for (const s of main.subs) iconBySlug.set(s.slug, s.icon);
  }
  const rows = await db.select().from(schema.categories);
  for (const row of rows) {
    const icon = iconBySlug.get(row.slug);
    if (icon && row.icon !== icon) {
      await db.update(schema.categories).set({ icon }).where(eq(schema.categories.id, row.id));
    }
  }
}

// مجموعات مرادفات البحث (سبرنت v2 — جزء 4): "زبادي" يجب أن يجد "روب"
const SYNONYM_GROUPS: string[][] = [
  ['زبادي', 'روب', 'لبن رايب'],
  ['حليب', 'لبن طازج'],
  ['شاي', 'شاهي'],
  ['ارز', 'رز'],
  ['مكرونه', 'معكرونه', 'باستا'],
  ['مناديل', 'محارم'],
  ['ماء', 'مياه', 'مويه'],
  ['مسحوق', 'صابون غسيل', 'منظف غسيل'],
  ['حفاضات', 'حفايض', 'بامبرز'],
  ['جبن', 'جبنه'],
  ['عصير', 'جوس'],
  ['المراعي', 'almarai'],
  ['نادك', 'nadec'],
  ['نستله', 'nestle'],
  ['ليبتون', 'lipton'],
  ['بيبسي', 'pepsi'],
  ['تايد', 'tide'],
];

/** upsert مرادفات البحث — يُستدعى عند كل إقلاع */
export async function ensureSynonyms() {
  const values = SYNONYM_GROUPS.flatMap((group, i) =>
    group.map((term) => ({
      groupKey: `g${i}-${normalizeArabic(group[0]!)}`,
      term: normalizeArabic(term),
    })),
  );
  await db.insert(schema.searchSynonyms).values(values).onConflictDoNothing();
}

export async function runSeed(opts: { wipe?: boolean } = {}): Promise<SeedCounts> {
  const rand = rng(20260612);
  if (opts.wipe ?? true) await wipe();

  // 1) مدن + مرادفات — upsert
  const cityRows = await ensureCities();
  await ensureSynonyms();
  const cityByCode = new Map(cityRows.map((c) => [c.code, c]));

  // 2) متاجر وفروع
  let storeRows = await db.select().from(schema.stores);
  let branchRows = await db.select().from(schema.storeBranches);
  if (storeRows.length === 0) {
    storeRows = await db.insert(schema.stores).values(STORES).returning();
    const storeBySlugTmp = new Map(storeRows.map((s) => [s.slug, s]));
    branchRows = await db
      .insert(schema.storeBranches)
      .values(
        BRANCHES.filter((b) => cityByCode.has(b.city)).map((b) => ({
          storeId: storeBySlugTmp.get(b.store)!.id,
          cityId: cityByCode.get(b.city)!.id,
          nameAr: b.nameAr,
          address: b.address,
          lat: b.lat,
          lng: b.lng,
          isActive: true,
        })),
      )
      .returning();
  }
  const storeBySlug = new Map(storeRows.map((s) => [s.slug, s]));

  // 3) تصنيفات بمستويين
  let subCount = 0;
  const catBySlug = new Map<string, number>();
  const existingCats = await db.select().from(schema.categories);
  if (existingCats.length === 0) {
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
            icon: s.icon,
            sortOrder: j,
          })),
        )
        .returning();
      for (const s of subs) catBySlug.set(s.slug, s.id);
      subCount += subs.length;
    }
  } else {
    for (const c of existingCats) {
      catBySlug.set(c.slug, c.id);
      if (c.parentId != null) subCount++;
    }
  }

  // 4) منتجات + أسعار — فقط إذا كان كتالوج المنتجات فارغاً
  let productRows = await db.select().from(schema.products);
  let priceCount = 0;
  const productsWereEmpty = productRows.length === 0;
  if (productsWereEmpty) {
    productRows = await db
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

    // 5) أسعار حالية: كل منتج في 3–5 سلاسل، في كل الفروع
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
      const count = 3 + Math.floor(rand() * 3);
      const shuffled = [...chainSlugs].sort(() => rand() - 0.5).slice(0, count);
      const offerStore = i % 8 === 0 ? shuffled[0] : null; // ~20 منتجاً عليها عرض ساري

      for (const slug of shuffled) {
        const store = storeBySlug.get(slug);
        if (!store) continue;
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
        const store = storeBySlug.get(shuffled[0]!);
        const branch = store ? branchRows.find((b) => b.storeId === store.id) : null;
        if (branch) {
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
      }

      // 7) نمط عروض متكرر في الأسبوع الأول — لكشف أفضل وقت (قسم 6.4)
      if (i < 5) {
        const store = storeBySlug.get('othaim');
        const branch = store ? branchRows.find((b) => b.storeId === store.id) : null;
        if (branch) {
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
    }
    for (let i = 0; i < priceValues.length; i += 500) {
      await db.insert(schema.prices).values(priceValues.slice(i, i + 500));
    }
    priceCount = priceValues.length;
  }

  // 8) مستخدمان تجريبيان — لا يُلمَس أي حساب موجود
  const makkah = cityByCode.get('makkah') ?? cityRows[0]!;
  let demo = await db.query.users.findFirst({
    where: eq(schema.users.email, 'demo@waffir.app'),
  });
  const demoJustCreated = !demo;
  if (!demo) {
    [demo] = await db
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
  }
  const adminExists = await db.query.users.findFirst({
    where: eq(schema.users.email, 'admin@waffir.app'),
  });
  if (!adminExists) {
    await db.insert(schema.users).values({
      email: 'admin@waffir.app',
      passwordHash: await bcrypt.hash('Admin1234!', 12),
      name: 'مدير وفّر',
      role: 'admin',
      cityId: makkah.id,
      shoppingDay: 4,
    });
  }

  // 9) تاريخ شراء 3 أشهر للمستخدم التجريبي (فقط عند إنشائه حديثاً)
  let purchaseCount = 0;
  const pandaStore = storeBySlug.get('panda');
  const othaimStore = storeBySlug.get('othaim');
  const pandaMakkah = branchRows.find(
    (b) => b.storeId === pandaStore?.id && b.cityId === makkah.id,
  );
  const othaimMakkah = branchRows.find(
    (b) => b.storeId === othaimStore?.id && b.cityId === makkah.id,
  );
  if (demoJustCreated && pandaMakkah && othaimMakkah && productRows.length > 0) {
    const demoProducts = productRows.filter((_, i) => i % 11 === 0).slice(0, 15);
    const purchaseValues: (typeof schema.purchases.$inferInsert)[] = [];
    // محاذاة التاريخ مع يوم التسوق القادم: آخر شراء قبل 30 يوماً من يوم
    // التسوق القادم بالضبط حتى يقع الاستحقاق داخل نافذة التوليد دائماً
    const now = new Date();
    const nextShopping = new Date(now.getFullYear(), now.getMonth(), 4);
    if (nextShopping.getTime() < now.getTime()) nextShopping.setMonth(nextShopping.getMonth() + 1);
    for (const [j, p] of demoProducts.entries()) {
      const basePrice = PRODUCTS[productRows.indexOf(p)]![5];
      for (const cyclesBack of [3, 2, 1]) {
        const jitter = Math.floor(rand() * 5) - 2;
        purchaseValues.push({
          userId: demo!.id,
          productId: p.id,
          branchId: j % 2 === 0 ? pandaMakkah.id : othaimMakkah.id,
          quantity: String(1 + (j % 3 === 0 ? 1 : 0)),
          price: String(round2(basePrice * (0.95 + rand() * 0.1))),
          purchasedAt: new Date(nextShopping.getTime() - (cyclesBack * 30 + jitter) * DAY),
        });
      }
    }
    await db.insert(schema.purchases).values(purchaseValues);
    purchaseCount = purchaseValues.length;

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
  }

  // 11) ملفات المصادر (قسم 13.2) + معايرة بنده — عند الخلو فقط
  const existingProfiles = await db.select().from(schema.storeSourceProfiles).limit(1);
  if (existingProfiles.length === 0 && pandaStore && othaimStore) {
    const barakaStore = storeBySlug.get('baraka');
    await db.insert(schema.storeSourceProfiles).values([
      {
        storeId: pandaStore.id,
        sourceType: 'web_catalog',
        endpointOrUrl: 'https://www.panda.com.sa',
        priceBasis: 'online',
        priority: 1,
        isConfirmed: true,
        lastSuccessAt: daysAgo(0),
      },
      {
        storeId: pandaStore.id,
        sourceType: 'flyer',
        endpointOrUrl: 'https://www.panda.com.sa/offers',
        priceBasis: 'shelf',
        priority: 2,
        isConfirmed: true,
        lastSuccessAt: daysAgo(0),
        learnedPublishWeekday: 4, // الخميس
      },
      {
        storeId: othaimStore.id,
        sourceType: 'flyer',
        endpointOrUrl: 'https://www.othaimmarkets.com/offers',
        priceBasis: 'shelf',
        priority: 1,
        isConfirmed: true,
        lastSuccessAt: daysAgo(1),
        learnedPublishWeekday: 3, // الأربعاء
      },
      ...(barakaStore
        ? [
            {
              storeId: barakaStore.id,
              sourceType: 'user_only' as const,
              priceBasis: 'shelf' as const,
              priority: 1,
              isConfirmed: true,
            },
          ]
        : []),
    ]);
    await db
      .insert(schema.chainCalibrations)
      .values({ storeId: pandaStore.id, factor: 0.95, sampleCount: 8 })
      .onConflictDoNothing();
  }

  // 12) أسماء خام (aliases) لـ20 منتجاً — مطابقة الكتالوجات والفواتير
  if (productsWereEmpty && pandaStore && othaimStore) {
    await db
      .insert(schema.productAliases)
      .values(
        productRows.slice(0, 20).map((p, i) => ({
          productId: p.id,
          storeId: (i % 2 === 0 ? pandaStore : othaimStore).id,
          rawName: p.nameAr.replace(/كجم/, 'kg').replace(/لتر/, 'L').replace(/أ/g, 'ا'),
        })),
      )
      .onConflictDoNothing();
  }

  return {
    cities: cityRows.length,
    stores: storeRows.length,
    branches: branchRows.length,
    mains: CATEGORIES.length,
    subs: subCount,
    products: productRows.length,
    prices: priceCount,
    purchases: purchaseCount,
  };
}

// تشغيل CLI مباشر: npm run seed (مسح كامل ثم بناء)
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  (async () => {
    await runMigrations();
    const counts = await runSeed({ wipe: true });
    console.log('✓ البذر اكتمل:', JSON.stringify(counts, null, 1));
    await pool.end();
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
