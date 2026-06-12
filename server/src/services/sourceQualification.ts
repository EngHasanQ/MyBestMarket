// تأهيل المصادر: "هل لهذا المتجر مصدر أسعار؟" (القسم 13.2 من الملحق)

import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export interface QualificationResult {
  storeId: number;
  sources: Array<{
    sourceType: 'api' | 'web_catalog' | 'flyer' | 'user_only';
    endpointOrUrl: string | null;
    platformHint: string | null;
    priority: number;
  }>;
}

const PLATFORM_SIGNATURES: Array<{ hint: string; pattern: RegExp; api: boolean }> = [
  { hint: 'salla', pattern: /salla\.(sa|network)|cdn\.salla/i, api: true },
  { hint: 'zid', pattern: /zid\.(sa|store)|zid\.web/i, api: true },
  { hint: 'shopify', pattern: /cdn\.shopify|myshopify\.com/i, api: true },
];

const OFFER_PAGE_HINTS = /العروض|عروض|offers|promotions|flyer|magazine|مجلة/i;
const PRODUCT_PAGE_HINTS = /add-to-cart|product|سلة|أضف|اضف|السعر|ر\.س|SAR|سعر/i;

/** جلب صفحة بأدب (مهلة قصيرة + هوية واضحة)؛ يُرجع null عند الفشل */
export async function fetchPage(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'WaffirBot/1.0 (+https://waffir.app/bot)' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** تحليل HTML الصفحة الرئيسة لاكتشاف نوع المصدر — نقي وقابل للاختبار */
export function classifyHomepage(html: string): {
  platformHint: string | null;
  hasApi: boolean;
  hasCatalog: boolean;
  hasOffersPage: boolean;
} {
  let platformHint: string | null = null;
  let hasApi = false;
  for (const sig of PLATFORM_SIGNATURES) {
    if (sig.pattern.test(html)) {
      platformHint = sig.hint;
      hasApi = sig.api;
      break;
    }
  }
  return {
    platformHint,
    hasApi,
    hasCatalog: PRODUCT_PAGE_HINTS.test(html),
    hasOffersPage: OFFER_PAGE_HINTS.test(html),
  };
}

/**
 * تأهيل سلسلة واحدة: يفحص موقعها ويملأ store_source_profiles.
 * النتائج تتطلب تأكيد الأدمن مرة واحدة (is_confirmed=false) قبل التفعيل.
 * يقبل fixtureHtml للاختبارات.
 */
export async function qualifyStore(
  storeId: number,
  opts: { website?: string | null; fixtureHtml?: string | null } = {},
): Promise<QualificationResult> {
  // الموقع: من المعطى أو من أماكن الاكتشاف المرتبطة بالسلسلة
  let website = opts.website ?? null;
  if (!website) {
    const place = await db.query.discoveredPlaces.findFirst({
      where: eq(schema.discoveredPlaces.chainStoreId, storeId),
    });
    website = place?.website ?? null;
  }

  const sources: QualificationResult['sources'] = [];
  if (website) {
    const html = opts.fixtureHtml ?? (await fetchPage(website));
    if (html) {
      const c = classifyHomepage(html);
      if (c.hasApi) {
        sources.push({
          sourceType: 'api',
          endpointOrUrl: website,
          platformHint: c.platformHint,
          priority: 1,
        });
      }
      if (c.hasCatalog) {
        sources.push({
          sourceType: 'web_catalog',
          endpointOrUrl: website,
          platformHint: c.platformHint,
          priority: 2,
        });
      }
      if (c.hasOffersPage) {
        sources.push({
          sourceType: 'flyer',
          endpointOrUrl: website,
          platformHint: c.platformHint,
          priority: 3,
        });
      }
    }
  }

  // خزّن الملفات الجديدة فقط (إعادة التأهيل الشهرية لا تكرر الصفوف)
  for (const s of sources) {
    const existing = await db.query.storeSourceProfiles.findFirst({
      where: and(
        eq(schema.storeSourceProfiles.storeId, storeId),
        eq(schema.storeSourceProfiles.sourceType, s.sourceType),
      ),
    });
    if (!existing) {
      await db.insert(schema.storeSourceProfiles).values({
        storeId,
        sourceType: s.sourceType,
        endpointOrUrl: s.endpointOrUrl,
        platformHint: s.platformHint,
        priority: s.priority,
        isConfirmed: false,
        priceBasis: s.sourceType === 'flyer' ? 'shelf' : 'unknown',
      });
    }
  }

  // لا مصدر إطلاقاً → استبعاد أماكن السلسلة من الكتالوج (قسم 13.2)
  const anyProfile = await db.query.storeSourceProfiles.findFirst({
    where: eq(schema.storeSourceProfiles.storeId, storeId),
  });
  const newStatus = anyProfile ? 'active' : 'excluded_no_source';
  await db
    .update(schema.discoveredPlaces)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(schema.discoveredPlaces.chainStoreId, storeId));

  return { storeId, sources };
}

/** تأهيل كل السلاسل المكتشفة غير المؤهلة بعد */
export async function qualifyPendingStores(): Promise<{ qualified: number; excluded: number }> {
  const pending = await db
    .selectDistinct({ storeId: schema.discoveredPlaces.chainStoreId })
    .from(schema.discoveredPlaces)
    .where(and(eq(schema.discoveredPlaces.status, 'pending')));
  let qualified = 0;
  let excluded = 0;
  for (const p of pending) {
    if (p.storeId == null) continue;
    const result = await qualifyStore(p.storeId);
    if (result.sources.length > 0) qualified++;
    else excluded++;
  }
  return { qualified, excluded };
}

/** تأكيد الأدمن لمصدر: يفعّل الملف وفروع السلسلة (قسم 13.2) */
export async function confirmSource(profileId: number) {
  const [profile] = await db
    .update(schema.storeSourceProfiles)
    .set({ isConfirmed: true })
    .where(eq(schema.storeSourceProfiles.id, profileId))
    .returning();
  if (!profile) throw Object.assign(new Error('profile not found'), { status: 404 });
  await db
    .update(schema.storeBranches)
    .set({ isActive: true })
    .where(eq(schema.storeBranches.storeId, profile.storeId));
  await db
    .update(schema.discoveredPlaces)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(schema.discoveredPlaces.chainStoreId, profile.storeId));
  return profile;
}
