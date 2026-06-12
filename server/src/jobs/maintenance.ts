// وظائف الصيانة: انتهاء العروض، اكتساح القِدم، صحة المصادر، لقطة KPI (القسم 15)

import { and, eq, gt, lt, sql, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { fetchPage } from '../services/sourceQualification.js';
import { accuracyKpi } from '../services/priceResolver.js';
import type { JobResult } from './framework.js';

/** offer-expiry (كل ساعة): عرض انتهى → ثقة 0، لا يظهر بعدها أبداً (قسم 14.1) */
export async function offerExpiry(): Promise<JobResult> {
  const result = await db
    .update(schema.prices)
    .set({ confidence: 0 })
    .where(
      and(
        eq(schema.prices.isOffer, true),
        lt(schema.prices.offerEndsAt, new Date()),
        gt(schema.prices.confidence, 0),
      ),
    )
    .returning({ id: schema.prices.id });
  return { itemsIn: result.length, itemsOut: result.length };
}

/** staleness-sweep (يومياً): يصفّر الثقة المخزنة للأسعار التي بلغ تناقصها الصفر */
export async function stalenessSweep(): Promise<JobResult> {
  const result = await db.execute(sql`
    UPDATE prices
    SET confidence = 0
    WHERE confidence > 0
      AND is_offer = FALSE
      AND last_verified_at < NOW() - (confidence::float / ${config.confidenceDecayPerDay}) * INTERVAL '1 day'
    RETURNING id
  `);
  const n = result.rows?.length ?? 0;
  return { itemsIn: n, itemsOut: n };
}

/** source-health (يومياً): 3 إخفاقات متتالية → تنبيه أدمن وتُعلَّم أسعار السلسلة قديمة */
export async function sourceHealth(): Promise<JobResult> {
  const profiles = await db
    .select()
    .from(schema.storeSourceProfiles)
    .where(eq(schema.storeSourceProfiles.isConfirmed, true));
  let ok = 0;
  let failed = 0;

  for (const p of profiles) {
    if (!p.endpointOrUrl) continue;
    const page = await fetchPage(p.endpointOrUrl);
    if (page != null) {
      ok++;
      await db
        .update(schema.storeSourceProfiles)
        .set({ lastSuccessAt: new Date(), failureCount: 0 })
        .where(eq(schema.storeSourceProfiles.id, p.id));
      continue;
    }
    failed++;
    const failureCount = p.failureCount + 1;
    await db
      .update(schema.storeSourceProfiles)
      .set({ failureCount })
      .where(eq(schema.storeSourceProfiles.id, p.id));

    if (failureCount === 3) {
      // تقادم فوري لأسعار السلسلة المكشوطة + تنبيه كل الأدمن
      await db.execute(sql`
        UPDATE prices SET last_verified_at = NOW() - INTERVAL '15 days'
        WHERE source IN ('api','scrape')
          AND branch_id IN (SELECT id FROM store_branches WHERE store_id = ${p.storeId})
      `);
      const admins = await db.select().from(schema.users).where(eq(schema.users.role, 'admin'));
      const store = await db.query.stores.findFirst({ where: eq(schema.stores.id, p.storeId) });
      for (const a of admins) {
        await db.insert(schema.notifications).values({
          userId: a.id,
          type: 'system',
          title: 'تعذّر الوصول إلى مصدر أسعار',
          body: `فشل مصدر ${store?.nameAr ?? p.storeId} (${p.sourceType}) ثلاث مرات متتالية — عُلِّمت أسعاره قديمة.`,
        });
      }
    }
  }
  return { itemsIn: profiles.length, itemsOut: ok, errors: failed };
}

/** kpi-snapshot (يومياً): تسجيل تاريخ مؤشر الدقة لكل مدينة (قسم 14.5) */
export async function kpiSnapshot(): Promise<JobResult> {
  const day = new Date().toISOString().slice(0, 10);
  const allCities = await db.select().from(schema.cities);
  let written = 0;
  for (const city of allCities) {
    const kpi = await accuracyKpi(city.id);
    // idempotent: لقطة واحدة لكل (يوم، مدينة)
    const existing = await db
      .select()
      .from(schema.kpiSnapshots)
      .where(and(eq(schema.kpiSnapshots.day, day), eq(schema.kpiSnapshots.cityId, city.id)));
    if (existing.length > 0) continue;
    await db.insert(schema.kpiSnapshots).values({
      day,
      cityId: city.id,
      displayedPrices: kpi.displayed,
      freshVerified: kpi.fresh,
    });
    written++;
  }
  return { itemsIn: allCities.length, itemsOut: written };
}

/** flyer-watcher (يومياً + بكثافة يوم النشر المتعلَّم): كشف مجلة جديدة عبر hash المحتوى */
export async function flyerWatcher(): Promise<JobResult> {
  const profiles = await db
    .select()
    .from(schema.storeSourceProfiles)
    .where(
      and(
        eq(schema.storeSourceProfiles.sourceType, 'flyer'),
        eq(schema.storeSourceProfiles.isConfirmed, true),
      ),
    );
  let detected = 0;
  for (const p of profiles) {
    if (!p.endpointOrUrl) continue;
    const page = await fetchPage(p.endpointOrUrl);
    if (page == null) continue;
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(page).digest('hex');
    if (hash !== p.lastContentHash) {
      detected++;
      await db
        .update(schema.storeSourceProfiles)
        .set({
          lastContentHash: hash,
          lastSuccessAt: new Date(),
          // تعلّم يوم النشر: معظم السلاسل السعودية تنشر أسبوعياً (قسم 14.1)
          learnedPublishWeekday: new Date().getDay(),
        })
        .where(eq(schema.storeSourceProfiles.id, p.id));
      if (p.lastContentHash != null) {
        const admins = await db.select().from(schema.users).where(eq(schema.users.role, 'admin'));
        const store = await db.query.stores.findFirst({ where: eq(schema.stores.id, p.storeId) });
        for (const a of admins) {
          await db.insert(schema.notifications).values({
            userId: a.id,
            type: 'system',
            title: 'مجلة عروض جديدة',
            body: `رُصدت مجلة جديدة لـ ${store?.nameAr ?? p.storeId} — ارفعها لخط OCR للمراجعة.`,
            payload: { storeId: p.storeId, url: p.endpointOrUrl },
          });
        }
      }
    } else {
      await db
        .update(schema.storeSourceProfiles)
        .set({ lastSuccessAt: new Date() })
        .where(eq(schema.storeSourceProfiles.id, p.id));
    }
  }
  return { itemsIn: profiles.length, itemsOut: detected };
}
