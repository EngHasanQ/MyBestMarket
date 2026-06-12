import { describe, expect, it } from 'vitest';
import {
  computeStats,
  generateMonthlyCandidates,
  resolveCheapest,
  roundQuantity,
  type PurchaseEvent,
} from '../../src/services/consumption.js';

const d = (iso: string) => new Date(iso);
const ev = (productId: number, date: string, quantity = 1): PurchaseEvent => ({
  productId,
  quantity,
  purchasedAt: d(date),
});

describe('computeStats', () => {
  it('لا أحداث → null', () => {
    expect(computeStats(1, [])).toBeNull();
  });

  it('شراء واحد → فاصل null مع كمية وآخر شراء', () => {
    const s = computeStats(1, [ev(1, '2026-05-01', 2)])!;
    expect(s.medianIntervalDays).toBeNull();
    expect(s.medianQuantity).toBe(2);
    expect(s.purchaseCount).toBe(1);
  });

  it('فواصل منتظمة شهرية ≈ 30 يوماً', () => {
    const s = computeStats(1, [ev(1, '2026-01-04'), ev(1, '2026-02-03'), ev(1, '2026-03-05')])!;
    expect(s.medianIntervalDays).toBeGreaterThan(28);
    expect(s.medianIntervalDays).toBeLessThan(32);
  });

  it('فواصل غير منتظمة: الترجيح الأُسّي يميل للأحدث', () => {
    // فواصل: 10، 10، 40 — الوسيط المرجّح (أوزان 1,2,4) يقع على الأحدث (40)
    const s = computeStats(1, [
      ev(1, '2026-01-01'),
      ev(1, '2026-01-11'),
      ev(1, '2026-01-21'),
      ev(1, '2026-03-02'),
    ])!;
    expect(s.medianIntervalDays).toBe(40);
  });

  it('يتجاهل أحداث المنتجات الأخرى', () => {
    const s = computeStats(1, [ev(1, '2026-01-01'), ev(2, '2026-02-01')])!;
    expect(s.purchaseCount).toBe(1);
  });
});

describe('generateMonthlyCandidates', () => {
  const shoppingDate = d('2026-07-04');

  it('منتج شهري مستحق يدخل القائمة بكميته الوسيطة', () => {
    const events = [ev(1, '2026-04-04', 2), ev(1, '2026-05-04', 2), ev(1, '2026-06-04', 2)];
    const out = generateMonthlyCandidates(events, shoppingDate);
    expect(out).toHaveLength(1);
    expect(out[0]!.productId).toBe(1);
    expect(out[0]!.quantity).toBe(2);
  });

  it('منتج اشتُري للتو بفاصل طويل لا يدخل', () => {
    // فاصل 60 يوماً، آخر شراء 2026-06-25 → مستحق 2026-08-24 خارج النافذة
    const events = [ev(2, '2026-04-26'), ev(2, '2026-06-25')];
    expect(generateMonthlyCandidates(events, shoppingDate)).toHaveLength(0);
  });

  it('fallback: شراء واحد قديم ≥ 21 يوماً يدخل', () => {
    const out = generateMonthlyCandidates([ev(3, '2026-06-01', 3)], shoppingDate);
    expect(out).toHaveLength(1);
    expect(out[0]!.quantity).toBe(3);
  });

  it('fallback: شراء واحد حديث لا يدخل', () => {
    expect(generateMonthlyCandidates([ev(3, '2026-06-25')], shoppingDate)).toHaveLength(0);
  });

  it('نهاية النافذة = الفاصل/2 بعد يوم التسوق', () => {
    // فاصل 30: مستحق 2026-07-18 — داخل (4+15=19 يوليو)
    const inside = [ev(4, '2026-05-19'), ev(4, '2026-06-18')];
    expect(generateMonthlyCandidates(inside, shoppingDate)).toHaveLength(1);
    // مستحق 2026-07-20 — خارج
    const outside = [ev(5, '2026-05-21'), ev(5, '2026-06-20')];
    expect(generateMonthlyCandidates(outside, shoppingDate)).toHaveLength(0);
  });
});

describe('roundQuantity', () => {
  it('يقرب لأقرب عدد صحيح بحد أدنى 1', () => {
    expect(roundQuantity(0.4)).toBe(1);
    expect(roundQuantity(2.6)).toBe(3);
  });
});

describe('resolveCheapest', () => {
  const counts = new Map([
    [10, 5],
    [20, 2],
  ]);

  it('أرخص سعر بثقة كافية وغير قديم', () => {
    const best = resolveCheapest(
      [
        { branchId: 1, storeId: 10, price: 12, confidence: 80, stale: false },
        { branchId: 2, storeId: 20, price: 10, confidence: 75, stale: false },
      ],
      counts,
    )!;
    expect(best.branchId).toBe(2);
  });

  it('ثقة أقل من 70 تُستبعد ما دام بديل موجوداً', () => {
    const best = resolveCheapest(
      [
        { branchId: 1, storeId: 10, price: 9, confidence: 50, stale: false },
        { branchId: 2, storeId: 20, price: 11, confidence: 90, stale: false },
      ],
      counts,
    )!;
    expect(best.branchId).toBe(2);
  });

  it('التعادل يُحسم لمتجر يحوي عناصر أكثر (تقليل عدد المتاجر)', () => {
    const best = resolveCheapest(
      [
        { branchId: 2, storeId: 20, price: 10, confidence: 90, stale: false },
        { branchId: 1, storeId: 10, price: 10, confidence: 90, stale: false },
      ],
      counts,
    )!;
    expect(best.storeId).toBe(10);
  });

  it('كل المصادر ضعيفة → يقع على الأفضل المتاح بدل لا شيء', () => {
    const best = resolveCheapest(
      [{ branchId: 1, storeId: 10, price: 9, confidence: 40, stale: false }],
      counts,
    )!;
    expect(best.branchId).toBe(1);
  });

  it('قائمة فارغة → null', () => {
    expect(resolveCheapest([], counts)).toBeNull();
  });
});
