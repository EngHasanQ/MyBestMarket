import { describe, expect, it } from 'vitest';
import {
  applyCalibration,
  nextCalibration,
  pickDisplayPrice,
} from '../../src/services/priceResolver.js';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  branchId: 1,
  price: 10,
  source: 'scrape',
  basis: 'online',
  confidence: 80,
  isOffer: false,
  offerEndsAt: null as Date | null,
  lastVerifiedAt: new Date(),
  ...over,
});

describe('pickDisplayPrice — أعلى ثقة فعلية ثم الأحدث', () => {
  it('فاتورة حديثة (99) تتفوق على كشط اليوم (80)', () => {
    const chosen = pickDisplayPrice([
      row({ id: 1, source: 'scrape', confidence: 80 }),
      row({ id: 2, source: 'receipt_ocr', confidence: 99, basis: 'shelf' }),
    ])!;
    expect(chosen.id).toBe(2);
  });

  it('تقرير قديم يخسر أمام كشط اليوم بعد التناقص', () => {
    // 90 − 8×5 = 50 < 80
    const chosen = pickDisplayPrice([
      row({ id: 1, source: 'user_report', confidence: 90, lastVerifiedAt: daysAgo(8) }),
      row({ id: 2, source: 'scrape', confidence: 80 }),
    ])!;
    expect(chosen.id).toBe(2);
  });

  it('عرض منتهٍ لا يُختار أبداً حتى لو وحيداً غير صفري', () => {
    const chosen = pickDisplayPrice([
      row({ id: 1, isOffer: true, offerEndsAt: daysAgo(1), source: 'flyer_ocr_verified', confidence: 95 }),
    ]);
    expect(chosen).toBeNull();
  });

  it('التعادل في الثقة يُحسم بالأحدث', () => {
    const chosen = pickDisplayPrice([
      row({ id: 1, lastVerifiedAt: new Date(Date.now() - 3_600_000) }),
      row({ id: 2, lastVerifiedAt: new Date() }),
    ])!;
    expect(chosen.id).toBe(2);
  });

  it('كله قديم → يختار الأفضل المتاح بدل لا شيء (مع وسم قديم في الواجهة)', () => {
    const chosen = pickDisplayPrice([row({ id: 1, lastVerifiedAt: daysAgo(15) })]);
    expect(chosen?.id).toBe(1);
  });
});

describe('المعايرة إلكتروني → رف (القسم 14.5)', () => {
  it('تتقارب نحو نسبة رف/إلكتروني', () => {
    // إلكتروني 12.0 ورف 10.5 → النسبة 0.875
    let cal = { factor: 1, sampleCount: 0 };
    for (let i = 0; i < 10; i++) cal = nextCalibration(cal.factor, cal.sampleCount, 12, 10.5);
    expect(cal.factor).toBeGreaterThan(0.86);
    expect(cal.factor).toBeLessThan(0.9);
    expect(cal.sampleCount).toBe(10);
  });

  it('applyCalibration يطبق المعامل ويقرب لهللتين', () => {
    expect(applyCalibration(12, 0.875)).toBe(10.5);
    expect(applyCalibration(9.99, 0.9)).toBe(8.99);
  });

  it('سعر إلكتروني صفري لا يفسد المعامل', () => {
    const cal = nextCalibration(0.9, 5, 0, 10);
    expect(cal.factor).toBe(0.9);
    expect(cal.sampleCount).toBe(5);
  });
});
