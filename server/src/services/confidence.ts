import { config } from '../config.js';

export interface PriceLike {
  source: string;
  confidence: number;
  isOffer: boolean;
  offerEndsAt: Date | null;
  lastVerifiedAt: Date;
  basis?: string;
}

/** الثقة الأساسية عند إدخال سعر جديد حسب مصدره (القسمان 2.4 و14) */
export function baseConfidence(source: string): number {
  return config.baseConfidence[source] ?? 50;
}

/**
 * الثقة الفعلية المعروضة الآن = الأساس − تناقص يومي.
 * سعر عرض منتهي الصلاحية = 0 (لا يُعرض أبداً بعد انتهائه — قسم 14.1).
 */
export function effectiveConfidence(p: PriceLike, now = new Date()): number {
  if (p.isOffer && p.offerEndsAt && p.offerEndsAt.getTime() < now.getTime()) return 0;
  const ageDays = Math.max(0, (now.getTime() - p.lastVerifiedAt.getTime()) / 86_400_000);
  // أسعار المجلات ثابتة الثقة طوال صلاحية العرض
  if (p.isOffer && p.offerEndsAt && p.source === 'flyer_ocr_verified') return p.confidence;
  return Math.max(0, Math.round(p.confidence - ageDays * config.confidenceDecayPerDay));
}

/** هل السعر قديم وفق سياسة القِدم؟ (القسم 2.5) */
export function isStale(p: PriceLike, now = new Date()): boolean {
  const limitDays = p.isOffer ? config.staleOfferDays : config.staleDays;
  if (p.isOffer && p.offerEndsAt && p.offerEndsAt.getTime() < now.getTime()) return true;
  const ageDays = (now.getTime() - p.lastVerifiedAt.getTime()) / 86_400_000;
  return ageDays > limitDays;
}

/** شارة الحداثة للواجهة */
export function freshnessLabel(lastVerifiedAt: Date, now = new Date()): string {
  const days = Math.floor((now.getTime() - lastVerifiedAt.getTime()) / 86_400_000);
  if (days <= 0) return 'تم التحقق اليوم';
  if (days === 1) return 'آخر تحديث أمس';
  return `آخر تحديث قبل ${days} أيام`;
}

/** حارس الشذوذ: انحراف > 40% عن الوسيط → مراجعة (القسم 14.5) */
export function isAnomalous(newPrice: number, trailingMedian: number | null): boolean {
  if (trailingMedian == null || trailingMedian <= 0) return false;
  return Math.abs(newPrice - trailingMedian) / trailingMedian > config.anomalyDeviation;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
