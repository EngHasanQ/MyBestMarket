import { describe, expect, it } from 'vitest';
import { detectBestTimes, weekOfMonth } from '../../src/services/bestTime.js';

const now = new Date('2026-06-11');

describe('weekOfMonth', () => {
  it('يحسب أسبوع الشهر 1..5', () => {
    expect(weekOfMonth(new Date('2026-06-01'))).toBe(1);
    expect(weekOfMonth(new Date('2026-06-08'))).toBe(2);
    expect(weekOfMonth(new Date('2026-06-30'))).toBe(5);
  });
});

describe('detectBestTimes', () => {
  it('3 عروض في الأسبوع الأول من أشهر مختلفة → توصية', () => {
    const events = ['2026-03-03', '2026-04-02', '2026-05-05'].map((d) => ({
      productId: 1,
      storeId: 10,
      date: new Date(d),
    }));
    const out = detectBestTimes(events, now);
    expect(out).toHaveLength(1);
    expect(out[0]!.weekOfMonth).toBe(1);
    expect(out[0]!.labelAr).toContain('الأسبوع الأول');
  });

  it('تكراران فقط لا يكفيان', () => {
    const events = ['2026-04-02', '2026-05-05'].map((d) => ({
      productId: 1,
      storeId: 10,
      date: new Date(d),
    }));
    expect(detectBestTimes(events, now)).toHaveLength(0);
  });

  it('يتجاهل الأحداث الأقدم من 6 أشهر', () => {
    const events = ['2025-09-01', '2025-10-01', '2025-11-01'].map((d) => ({
      productId: 1,
      storeId: 10,
      date: new Date(d),
    }));
    expect(detectBestTimes(events, now)).toHaveLength(0);
  });

  it('يفصل بين الدلاء حسب المتجر والمنتج', () => {
    const events = [
      ...['2026-03-03', '2026-04-02', '2026-05-05'].map((d) => ({
        productId: 1,
        storeId: 10,
        date: new Date(d),
      })),
      ...['2026-03-20', '2026-04-18', '2026-05-20'].map((d) => ({
        productId: 1,
        storeId: 20,
        date: new Date(d),
      })),
    ];
    const out = detectBestTimes(events, now);
    expect(out).toHaveLength(2);
    const weeks = new Set(out.map((o) => o.weekOfMonth));
    expect(weeks.has(1)).toBe(true);
    expect(weeks.has(3)).toBe(true);
  });
});
