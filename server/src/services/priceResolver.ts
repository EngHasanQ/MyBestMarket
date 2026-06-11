// طبقة حلّ الأسعار والمعايرة (القسم 14.5 من الملحق)

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import {
  effectiveConfidence,
  isStale,
  isAnomalous,
  median,
  baseConfidence,
  freshnessLabel,
  type PriceLike,
} from './confidence.js';

export interface ResolvedPrice {
  priceId: number;
  branchId: number;
  price: number;
  source: string;
  basis: string;
  isOffer: boolean;
  offerEndsAt: Date | null;
  lastVerifiedAt: Date;
  confidence: number; // فعلية بعد التناقص
  stale: boolean;
  estimated: boolean; // سعر إلكتروني معاير — يُعرض بوسم "تقديري"
  freshnessLabel: string;
}

interface PriceRow extends PriceLike {
  id: number;
  branchId: number;
  price: number;
}

/**
 * سعر العرض لكل (منتج، فرع) = أعلى ثقة فعلية غير قديمة؛ التعادل يُحسم بالأحدث.
 * أسعار العروض المنتهية تُستبعد نهائياً.
 */
export function pickDisplayPrice<T extends PriceRow>(rows: T[], now = new Date()): T | null {
  const candidates = rows.filter((r) => effectiveConfidence(r, now) > 0);
  if (candidates.length === 0) return null;
  const fresh = candidates.filter((r) => !isStale(r, now));
  const pool = fresh.length > 0 ? fresh : candidates;
  return pool.reduce((best, r) => {
    const cb = effectiveConfidence(best, now);
    const cr = effectiveConfidence(r, now);
    if (cr > cb) return r;
    if (cr === cb && r.lastVerifiedAt.getTime() > best.lastVerifiedAt.getTime()) return r;
    return best;
  });
}

/** تحديث معامل المعايرة الجاري (متوسط متحرك): رف/إلكتروني */
export function nextCalibration(
  currentFactor: number,
  sampleCount: number,
  onlinePrice: number,
  shelfPrice: number,
): { factor: number; sampleCount: number } {
  if (onlinePrice <= 0) return { factor: currentFactor, sampleCount };
  const ratio = shelfPrice / onlinePrice;
  const n = sampleCount + 1;
  const factor = currentFactor + (ratio - currentFactor) / Math.min(n, 20); // نافذة متحركة ~20 عينة
  return { factor, sampleCount: n };
}

export function applyCalibration(onlinePrice: number, factor: number): number {
  return Math.round(onlinePrice * factor * 100) / 100;
}

// ---------- دوال قاعدة البيانات ----------

/** آخر الأسعار لكل فرع لمنتج داخل مدينة، محلولة للعرض */
export async function resolveProductPrices(
  productId: number,
  cityId: number,
  now = new Date(),
): Promise<Map<number, ResolvedPrice>> {
  const branches = await db
    .select({ id: schema.storeBranches.id, storeId: schema.storeBranches.storeId })
    .from(schema.storeBranches)
    .where(and(eq(schema.storeBranches.cityId, cityId), eq(schema.storeBranches.isActive, true)));
  if (branches.length === 0) return new Map();
  const branchIds = branches.map((b) => b.id);
  const storeByBranch = new Map(branches.map((b) => [b.id, b.storeId]));

  // آخر 10 أسعار لكل فرع تكفي للحل (append-only)
  const rows = await db
    .select()
    .from(schema.prices)
    .where(and(eq(schema.prices.productId, productId), inArray(schema.prices.branchId, branchIds)))
    .orderBy(desc(schema.prices.createdAt))
    .limit(400);

  const factors = await getCalibrationFactors();

  const byBranch = new Map<number, PriceRow[]>();
  for (const r of rows) {
    const list = byBranch.get(r.branchId) ?? [];
    list.push({
      id: r.id,
      branchId: r.branchId,
      price: Number(r.price),
      source: r.source,
      basis: r.basis,
      confidence: r.confidence,
      isOffer: r.isOffer,
      offerEndsAt: r.offerEndsAt,
      lastVerifiedAt: r.lastVerifiedAt,
    });
    byBranch.set(r.branchId, list);
  }

  const out = new Map<number, ResolvedPrice>();
  for (const [branchId, list] of byBranch) {
    const chosen = pickDisplayPrice(list, now);
    if (!chosen) continue;
    let displayPrice = chosen.price;
    let estimated = false;
    if (chosen.basis === 'online') {
      const storeId = storeByBranch.get(branchId);
      const f = storeId != null ? factors.get(storeId) : undefined;
      if (f && f.sampleCount > 0 && Math.abs(f.factor - 1) > 0.001) {
        displayPrice = applyCalibration(chosen.price, f.factor);
        estimated = true;
      }
    }
    out.set(branchId, {
      priceId: chosen.id,
      branchId,
      price: displayPrice,
      source: chosen.source,
      basis: chosen.basis ?? 'shelf',
      isOffer: chosen.isOffer,
      offerEndsAt: chosen.offerEndsAt,
      lastVerifiedAt: chosen.lastVerifiedAt,
      confidence: effectiveConfidence(chosen, now),
      stale: isStale(chosen, now),
      estimated,
      freshnessLabel: freshnessLabel(chosen.lastVerifiedAt, now),
    });
  }
  return out;
}

async function getCalibrationFactors() {
  const rows = await db.select().from(schema.chainCalibrations);
  return new Map(rows.map((r) => [r.storeId, { factor: r.factor, sampleCount: r.sampleCount }]));
}

export interface SubmitPriceInput {
  productId: number;
  branchId: number;
  price: number;
  source: 'api' | 'scrape' | 'flyer_ocr_verified' | 'user_report' | 'receipt_ocr' | 'manual_admin';
  basis?: 'shelf' | 'online' | 'unknown';
  isOffer?: boolean;
  offerEndsAt?: Date | null;
  reportedBy?: number | null;
  confidence?: number; // تجاوز اختياري
}

export type SubmitPriceResult =
  | { status: 'published'; priceId: number }
  | { status: 'queued_anomaly'; queueId: number };

/**
 * إدخال سعر جديد مع حارس الشذوذ: انحراف >40% عن الوسيط المتأخر
 * لنفس (المنتج، السلسلة) → قائمة المراجعة بدلاً من النشر (القسم 14.5).
 */
export async function submitPrice(input: SubmitPriceInput): Promise<SubmitPriceResult> {
  const branch = await db.query.storeBranches.findFirst({
    where: eq(schema.storeBranches.id, input.branchId),
  });
  if (!branch) throw Object.assign(new Error('branch not found'), { status: 404 });

  // الوسيط المتأخر لنفس المنتج عبر فروع نفس السلسلة (آخر 90 يوماً)
  const since = new Date(Date.now() - 90 * 86_400_000);
  const history = await db
    .select({ price: schema.prices.price })
    .from(schema.prices)
    .innerJoin(schema.storeBranches, eq(schema.prices.branchId, schema.storeBranches.id))
    .where(
      and(
        eq(schema.prices.productId, input.productId),
        eq(schema.storeBranches.storeId, branch.storeId),
        gte(schema.prices.createdAt, since),
      ),
    )
    .orderBy(desc(schema.prices.createdAt))
    .limit(20);

  const trailingMedian = median(history.map((h) => Number(h.price)));
  // الإدخال اليدوي من الأدمن موثوق ولا يخضع للحارس
  if (input.source !== 'manual_admin' && isAnomalous(input.price, trailingMedian)) {
    const [q] = await db
      .insert(schema.offersReviewQueue)
      .values({
        branchId: input.branchId,
        kind: 'anomaly',
        rawText: `سعر شاذ: ${input.price} ر.س (الوسيط ${trailingMedian}) — المصدر ${input.source}`,
        parsedProductName: null,
        parsedPrice: String(input.price),
        matchedProductId: input.productId,
        status: 'pending',
      })
      .returning({ id: schema.offersReviewQueue.id });
    return { status: 'queued_anomaly', queueId: q!.id };
  }

  const confidence = input.confidence ?? baseConfidence(input.source);
  const [row] = await db
    .insert(schema.prices)
    .values({
      productId: input.productId,
      branchId: input.branchId,
      price: String(input.price),
      source: input.source,
      basis: input.basis ?? 'shelf',
      isOffer: input.isOffer ?? false,
      offerEndsAt: input.offerEndsAt ?? null,
      confidence,
      reportedBy: input.reportedBy ?? null,
    })
    .returning({ id: schema.prices.id });

  // معايرة إلكتروني→رف: سعر رف موثوق جديد يُحدّث معامل السلسلة (القسم 14.5)
  if ((input.basis ?? 'shelf') === 'shelf' && confidence >= 90) {
    await updateChainCalibration(branch.storeId, input.productId, input.price);
  }
  return { status: 'published', priceId: row!.id };
}

/** عند ورود سعر رف موثوق: قارنه بآخر سعر إلكتروني للسلسلة خلال نافذة 7 أيام وحدّث المعامل */
async function updateChainCalibration(storeId: number, productId: number, shelfPrice: number) {
  const since = new Date(Date.now() - config.calibrationWindowDays * 86_400_000);
  const [online] = await db
    .select({ price: schema.prices.price })
    .from(schema.prices)
    .innerJoin(schema.storeBranches, eq(schema.prices.branchId, schema.storeBranches.id))
    .where(
      and(
        eq(schema.prices.productId, productId),
        eq(schema.storeBranches.storeId, storeId),
        eq(schema.prices.basis, 'online'),
        gte(schema.prices.createdAt, since),
      ),
    )
    .orderBy(desc(schema.prices.createdAt))
    .limit(1);
  if (!online) return;

  const existing = await db.query.chainCalibrations.findFirst({
    where: eq(schema.chainCalibrations.storeId, storeId),
  });
  const cur = existing ?? { factor: 1, sampleCount: 0 };
  const next = nextCalibration(cur.factor, cur.sampleCount, Number(online.price), shelfPrice);
  await db
    .insert(schema.chainCalibrations)
    .values({ storeId, factor: next.factor, sampleCount: next.sampleCount, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.chainCalibrations.storeId,
      set: { factor: next.factor, sampleCount: next.sampleCount, updatedAt: new Date() },
    });
}

/** مؤشر الدقة: نسبة الأسعار المعروضة بثقة ≥90 وعمر ≤7 أيام (القسم 14.5) */
export async function accuracyKpi(cityId?: number) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  const cityFilter = cityId ? sql`AND sb.city_id = ${cityId}` : sql``;
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int AS displayed,
      COUNT(*) FILTER (WHERE p.confidence >= 90 AND p.last_verified_at >= ${sevenDaysAgo})::int AS fresh
    FROM (
      SELECT DISTINCT ON (product_id, branch_id) *
      FROM prices
      ORDER BY product_id, branch_id, created_at DESC
    ) p
    JOIN store_branches sb ON sb.id = p.branch_id
    WHERE TRUE ${cityFilter}
  `);
  const row = (result.rows?.[0] ?? { displayed: 0, fresh: 0 }) as {
    displayed: number;
    fresh: number;
  };
  return {
    displayed: row.displayed,
    fresh: row.fresh,
    ratio: row.displayed === 0 ? 0 : Math.round((row.fresh / row.displayed) * 1000) / 10,
  };
}
