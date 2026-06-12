import { describe, expect, it } from 'vitest';
import { extractSize } from '../../src/services/normalize.js';
import { rankProducts } from '../../src/services/searchService.js';

describe('extractSize — توحيد الأحجام (جزء 1.2)', () => {
  it('"٢ لتر" و"2L" و"2000 مل" كلها → 2 لتر', () => {
    expect(extractSize('حليب ٢ لتر')).toEqual({ value: 2, unit: 'لتر' });
    expect(extractSize('Milk 2L')).toEqual({ value: 2, unit: 'لتر' });
    expect(extractSize('حليب 2000 مل')).toEqual({ value: 2, unit: 'لتر' });
  });

  it('الجرامات تتحول كيلو', () => {
    expect(extractSize('أرز 500 جم')).toEqual({ value: 0.5, unit: 'كجم' });
    expect(extractSize('رز 5 كجم')).toEqual({ value: 5, unit: 'كجم' });
  });

  it('عبوات وحبات → حبة', () => {
    expect(extractSize('بيض 30 حبة')).toEqual({ value: 30, unit: 'حبة' });
  });

  it('بلا حجم → null', () => {
    expect(extractSize('صابون فيري')).toBeNull();
  });
});

describe('rankProducts — ترتيب البحث (جزء 4)', () => {
  const products = [
    { id: 1, normalizedName: 'حليب المراعي طازج كامل الدسم 2 لتر', brand: 'المراعي', sizeValue: '2', sizeUnit: 'لتر' },
    { id: 2, normalizedName: 'حليب المراعي طازج قليل الدسم 1 لتر', brand: 'المراعي', sizeValue: '1', sizeUnit: 'لتر' },
    { id: 3, normalizedName: 'روب نادك كامل الدسم 170 جم', brand: 'نادك', sizeValue: '170', sizeUnit: 'جم' },
    { id: 4, normalizedName: 'صابون فيري ليمون 1 لتر', brand: 'فيري', sizeValue: '1', sizeUnit: 'لتر' },
  ];

  it('"زبادي" يجد "روب" عبر المرادفات', () => {
    const termGroups = [['زبادي', 'روب', 'لبن رايب']];
    const out = rankProducts('زبادي', termGroups, products);
    expect(out.map((p) => p.id)).toContain(3);
    expect(out.map((p) => p.id)).not.toContain(4);
  });

  it('"حليب المراعي ٢ لتر" يعيد عبوة اللترين أولاً', () => {
    const termGroups = [['حليب', 'لبن طازج'], ['المراعي', 'almarai'], ['2'], ['لتر']];
    const out = rankProducts('حليب المراعي ٢ لتر', termGroups, products);
    expect(out[0]!.id).toBe(1);
    expect(out[1]!.id).toBe(2);
  });

  it('البحث بالعلامة وحدها يعيد منتجاتها', () => {
    const termGroups = [['المراعي', 'almarai']];
    const out = rankProducts('المراعي', termGroups, products);
    const ids = out.map((p) => p.id);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).not.toContain(4);
  });
});
