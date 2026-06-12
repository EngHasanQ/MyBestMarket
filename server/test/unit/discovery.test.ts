import { describe, expect, it } from 'vitest';
import { clusterChains, gridPoints, type PlaceResult } from '../../src/services/discovery.js';
import { classifyHomepage } from '../../src/services/sourceQualification.js';

const place = (placeId: string, name: string): PlaceResult => ({
  placeId,
  name,
  lat: 21.4,
  lng: 39.8,
  types: ['supermarket'],
});

describe('clusterChains — تجميع الفروع في سلاسل (قسم 13.1.3)', () => {
  it('فروع بنده الثلاثة → سلسلة واحدة، والبقالة المفردة مستقلة', () => {
    const clusters = clusterChains([
      place('p1', 'بنده - العزيزية'),
      place('p2', 'بنده - حي الروضة'),
      place('p3', 'هايبر بنده'),
      place('p4', 'بقالة النور'),
    ]);
    expect(clusters.size).toBe(2);
    const sizes = [...clusters.values()].map((m) => m.length).sort();
    expect(sizes).toEqual([1, 3]);
  });

  it('اختلافات إملائية بسيطة بين الفروع تُجمع', () => {
    const clusters = clusterChains([
      place('p1', 'أسواق المرشدي - العوالي'),
      place('p2', 'اسواق المرشدى فرع الششة'),
    ]);
    expect(clusters.size).toBe(1);
  });
});

describe('gridPoints', () => {
  it('يغطي صندوق الإحاطة بخطوة الشبكة', () => {
    const pts = gridPoints({ lat: 21.42, lng: 39.82, minLat: 21.4, minLng: 39.8, maxLat: 21.44, maxLng: 39.84 });
    expect(pts.length).toBeGreaterThanOrEqual(9);
    expect(pts[0]).toEqual({ lat: 21.4, lng: 39.8 });
  });

  it('بلا صندوق → افتراضي حول المركز', () => {
    const pts = gridPoints({ lat: 21.42, lng: 39.82, minLat: null, minLng: null, maxLat: null, maxLng: null });
    expect(pts.length).toBeGreaterThan(0);
  });
});

describe('classifyHomepage — تأهيل المصدر (قسم 13.2)', () => {
  it('يكتشف منصة سلة كـ API + كتالوج', () => {
    const c = classifyHomepage('<html><script src="https://cdn.salla.network/app.js"></script><div>أضف للسلة - السعر 12 ر.س</div></html>');
    expect(c.platformHint).toBe('salla');
    expect(c.hasApi).toBe(true);
    expect(c.hasCatalog).toBe(true);
  });

  it('يكتشف صفحة العروض', () => {
    const c = classifyHomepage('<a href="/offers">العروض الأسبوعية</a>');
    expect(c.hasOffersPage).toBe(true);
    expect(c.hasApi).toBe(false);
  });

  it('صفحة بلا أي إشارات → لا شيء', () => {
    const c = classifyHomepage('<html><body>مرحبا</body></html>');
    expect(c.platformHint).toBeNull();
    expect(c.hasCatalog).toBe(false);
    expect(c.hasOffersPage).toBe(false);
  });
});
