import { describe, expect, it } from 'vitest';
import {
  baseConfidence,
  effectiveConfidence,
  freshnessLabel,
  isAnomalous,
  isStale,
  median,
} from '../../src/services/confidence.js';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

const price = (over: Partial<Parameters<typeof effectiveConfidence>[0]> = {}) => ({
  source: 'scrape',
  confidence: 80,
  isOffer: false,
  offerEndsAt: null,
  lastVerifiedAt: new Date(),
  ...over,
});

describe('baseConfidence', () => {
  it('فاتورة 99، تقرير مستخدم 90، مجلة معتمدة 95، كشط 80', () => {
    expect(baseConfidence('receipt_ocr')).toBe(99);
    expect(baseConfidence('user_report')).toBe(90);
    expect(baseConfidence('flyer_ocr_verified')).toBe(95);
    expect(baseConfidence('scrape')).toBe(80);
  });
});

describe('effectiveConfidence — التناقص', () => {
  it('سعر اليوم = الثقة الأساسية', () => {
    expect(effectiveConfidence(price())).toBe(80);
  });

  it('كشط عمره 5 أيام ≈ 55 (80 − 5×5)', () => {
    expect(effectiveConfidence(price({ lastVerifiedAt: daysAgo(5) }))).toBe(55);
  });

  it('لا ينزل تحت الصفر', () => {
    expect(effectiveConfidence(price({ lastVerifiedAt: daysAgo(60) }))).toBe(0);
  });

  it('عرض منتهي الصلاحية = 0 دائماً ولا يُعرض', () => {
    const p = price({
      isOffer: true,
      source: 'flyer_ocr_verified',
      confidence: 95,
      offerEndsAt: daysAgo(1),
      lastVerifiedAt: daysAgo(2),
    });
    expect(effectiveConfidence(p)).toBe(0);
  });

  it('عرض مجلة ساري يحافظ على ثقته كاملة خلال الصلاحية', () => {
    const p = price({
      isOffer: true,
      source: 'flyer_ocr_verified',
      confidence: 95,
      offerEndsAt: new Date(Date.now() + 2 * 86_400_000),
      lastVerifiedAt: daysAgo(4),
    });
    expect(effectiveConfidence(p)).toBe(95);
  });
});

describe('isStale — سياسة القِدم', () => {
  it('عادي: قديم بعد 14 يوماً', () => {
    expect(isStale(price({ lastVerifiedAt: daysAgo(13) }))).toBe(false);
    expect(isStale(price({ lastVerifiedAt: daysAgo(15) }))).toBe(true);
  });

  it('عرض: قديم بعد 7 أيام', () => {
    const offer = (n: number) =>
      price({ isOffer: true, lastVerifiedAt: daysAgo(n), offerEndsAt: new Date(Date.now() + 86_400_000) });
    expect(isStale(offer(6))).toBe(false);
    expect(isStale(offer(8))).toBe(true);
  });
});

describe('isAnomalous — حارس الشذوذ', () => {
  it('انحراف أكثر من 40% عن الوسيط', () => {
    expect(isAnomalous(15, 10)).toBe(true); // +50%
    expect(isAnomalous(13, 10)).toBe(false); // +30%
    expect(isAnomalous(5, 10)).toBe(true); // −50%
  });

  it('بلا تاريخ → غير شاذ', () => {
    expect(isAnomalous(100, null)).toBe(false);
  });
});

describe('median', () => {
  it('فردي وزوجي وفارغ', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('freshnessLabel', () => {
  it('شارات عربية صحيحة', () => {
    expect(freshnessLabel(new Date())).toBe('تم التحقق اليوم');
    expect(freshnessLabel(daysAgo(1))).toBe('آخر تحديث أمس');
    expect(freshnessLabel(daysAgo(3))).toBe('آخر تحديث قبل 3 أيام');
  });
});
