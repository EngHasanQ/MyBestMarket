// خوارزمية الاستهلاك وتوليد القائمة الشهرية (القسم 6) — دوال نقية قابلة للاختبار

import { config } from '../config.js';

export interface PurchaseEvent {
  productId: number;
  quantity: number;
  purchasedAt: Date;
}

export interface ConsumptionStats {
  productId: number;
  medianIntervalDays: number | null; // null = أقل من شراءين
  medianQuantity: number;
  lastPurchaseAt: Date;
  purchaseCount: number;
}

/** وسيط مرجّح أُسّياً: الأحدث وزنه أعلى (القسم 6.1) */
function weightedMedian(values: number[], weights: number[]): number {
  const pairs = values
    .map((v, i) => ({ v, w: weights[i]! }))
    .sort((a, b) => a.v - b.v);
  const total = pairs.reduce((s, p) => s + p.w, 0);
  let acc = 0;
  for (const p of pairs) {
    acc += p.w;
    if (acc >= total / 2) return p.v;
  }
  return pairs[pairs.length - 1]!.v;
}

/** إحصاءات الاستهلاك لمنتج واحد من تاريخ مشترياته (مرتّبة أو لا) */
export function computeStats(productId: number, events: PurchaseEvent[]): ConsumptionStats | null {
  const mine = events
    .filter((e) => e.productId === productId)
    .sort((a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime());
  if (mine.length === 0) return null;

  const last = mine[mine.length - 1]!;
  const quantities = mine.map((e) => e.quantity);
  const qWeights = mine.map((_, i) => Math.pow(2, i)); // ترجيح أُسّي للأحدث

  let medianIntervalDays: number | null = null;
  if (mine.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < mine.length; i++) {
      intervals.push(
        (mine[i]!.purchasedAt.getTime() - mine[i - 1]!.purchasedAt.getTime()) / 86_400_000,
      );
    }
    const iWeights = intervals.map((_, i) => Math.pow(2, i));
    medianIntervalDays = weightedMedian(intervals, iWeights);
  }

  return {
    productId,
    medianIntervalDays,
    medianQuantity: weightedMedian(quantities, qWeights),
    lastPurchaseAt: last.purchasedAt,
    purchaseCount: mine.length,
  };
}

export interface ListCandidate {
  productId: number;
  quantity: number;
  nextDueDate: Date;
}

/**
 * توليد مرشّحي القائمة الشهرية (القسم 6.2):
 * next_due = آخر شراء + الوسيط؛ يُضم إذا وقع في
 * [يوم التسوق − 7 ، يوم التسوق + الفاصل/2].
 * fallback: منتج بشراء واحد يُضم إذا مرّ على شرائه ≥ 21 يوماً عند يوم التسوق.
 */
export function generateMonthlyCandidates(
  allEvents: PurchaseEvent[],
  shoppingDate: Date,
): ListCandidate[] {
  const productIds = [...new Set(allEvents.map((e) => e.productId))];
  const out: ListCandidate[] = [];

  for (const pid of productIds) {
    const stats = computeStats(pid, allEvents);
    if (!stats) continue;

    if (stats.medianIntervalDays == null) {
      // شراء واحد فقط — fallback على تاريخ القوائم/الشراء (قسم 6.1)
      const ageAtShopping =
        (shoppingDate.getTime() - stats.lastPurchaseAt.getTime()) / 86_400_000;
      if (ageAtShopping >= 21) {
        out.push({ productId: pid, quantity: roundQuantity(stats.medianQuantity), nextDueDate: shoppingDate });
      }
      continue;
    }

    const interval = stats.medianIntervalDays;
    const nextDue = new Date(stats.lastPurchaseAt.getTime() + interval * 86_400_000);
    const windowStart = shoppingDate.getTime() - config.listWindowBeforeDays * 86_400_000;
    const windowEnd = shoppingDate.getTime() + (interval / 2) * 86_400_000;

    if (nextDue.getTime() >= windowStart && nextDue.getTime() <= windowEnd) {
      out.push({
        productId: pid,
        quantity: roundQuantity(stats.medianQuantity),
        nextDueDate: nextDue,
      });
    }
  }
  return out.sort((a, b) => a.productId - b.productId);
}

/** تقريب الكمية لأقرب حجم عبوة منطقي (عدد صحيح ≥ 1) */
export function roundQuantity(q: number): number {
  return Math.max(1, Math.round(q));
}

export interface BranchPriceOption {
  branchId: number;
  storeId: number;
  price: number;
  confidence: number; // الثقة الفعلية بعد التناقص
  stale: boolean;
}

/**
 * حلّ أرخص مصدر (القسم 6.3): أقل سعر بثقة ≥ 70 وغير قديم؛
 * عند التعادل يُفضَّل المتجر الذي يحوي أكبر عدد من بقية العناصر.
 */
export function resolveCheapest(
  options: BranchPriceOption[],
  itemCountPerStore: Map<number, number>,
): BranchPriceOption | null {
  const eligible = options.filter(
    (o) => o.confidence >= config.minConfidenceForCheapest && !o.stale,
  );
  const pool = eligible.length > 0 ? eligible : options.filter((o) => !o.stale);
  const finalPool = pool.length > 0 ? pool : options; // لا مصدر أحدث — اعرض الأفضل المتاح
  if (finalPool.length === 0) return null;

  return finalPool.reduce((best, o) => {
    if (o.price < best.price) return o;
    if (o.price === best.price) {
      const a = itemCountPerStore.get(o.storeId) ?? 0;
      const b = itemCountPerStore.get(best.storeId) ?? 0;
      if (a > b) return o;
    }
    return best;
  });
}
