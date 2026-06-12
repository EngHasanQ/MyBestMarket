// كشف "أفضل وقت للشراء" من دورات العروض المتكررة (القسم 6.4)

import { config } from '../config.js';

export interface OfferEvent {
  productId: number;
  storeId: number;
  date: Date;
}

export interface TimingInsight {
  productId: number;
  storeId: number;
  weekOfMonth: number; // 1..5
  occurrences: number;
  labelAr: string;
}

const WEEK_LABELS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الأخير'];

export function weekOfMonth(d: Date): number {
  return Math.min(5, Math.floor((d.getDate() - 1) / 7) + 1);
}

/**
 * دلوُ التواريخ حسب أسبوع الشهر لكل (منتج، متجر)؛
 * ≥3 تكرارات في نفس الدلو خلال 6 أشهر → توصية توقيت.
 */
export function detectBestTimes(events: OfferEvent[], now = new Date()): TimingInsight[] {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - config.bestTimeLookbackMonths);

  const buckets = new Map<string, { count: number; productId: number; storeId: number; week: number }>();
  for (const e of events) {
    if (e.date.getTime() < cutoff.getTime() || e.date.getTime() > now.getTime()) continue;
    const week = weekOfMonth(e.date);
    const key = `${e.productId}:${e.storeId}:${week}`;
    const b = buckets.get(key) ?? { count: 0, productId: e.productId, storeId: e.storeId, week };
    b.count++;
    buckets.set(key, b);
  }

  const out: TimingInsight[] = [];
  for (const b of buckets.values()) {
    if (b.count >= config.bestTimeMinOccurrences) {
      out.push({
        productId: b.productId,
        storeId: b.storeId,
        weekOfMonth: b.week,
        occurrences: b.count,
        labelAr: `أفضل وقت للشراء: عادةً يكون أرخص في الأسبوع ${WEEK_LABELS[b.week - 1]} من الشهر`,
      });
    }
  }
  return out.sort((a, b) => b.occurrences - a.occurrences);
}
