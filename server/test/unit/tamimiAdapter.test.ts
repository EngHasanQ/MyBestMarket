// A3 — تحويل منتج التميمي (وحدة، بلا شبكة): السعر من variant.storeSpecificData،
// والصورة والباركود من المتغيّر، ومسار التصنيف من سلسلة primaryCategory.

import { describe, expect, it } from 'vitest';
import { mapTamimiProduct } from '../../src/adapters/tamimiStorefront.js';

const sample = {
  name: 'Large White Eggs Plastic Packaging',
  slug: 'large-white-eggs-2',
  brand: { name: 'Alwatania' },
  primaryCategory: {
    name: 'EGGS',
    parentCategory: { name: 'DAIRY', parentCategory: { name: 'FRESH', parentCategory: null } },
  },
  variants: [
    {
      barcodes: ['6287011950041'],
      images: ['https://storage.googleapis.com/tm/eggs.webp'],
      storeSpecificData: [{ discount: '0', mrp: '22.95', storeId: 4 }],
    },
  ],
};

describe('mapTamimiProduct', () => {
  it('يستخرج الاسم والسعر والصورة والباركود ومسار التصنيف', () => {
    const r = mapTamimiProduct(sample)!;
    expect(r).not.toBeNull();
    expect(r.rawName).toBe('Large White Eggs Plastic Packaging');
    expect(r.price).toBe(22.95);
    expect(r.brand).toBe('Alwatania');
    expect(r.barcode).toBe('6287011950041');
    expect(r.imageUrl).toContain('eggs.webp');
    expect(r.productUrl).toContain('large-white-eggs-2');
    expect(r.storeCategoryPath).toBe('FRESH > DAIRY > EGGS');
    expect(r.basis).toBe('online');
  });

  it('يطبّق الخصم على السعر (mrp 20 وخصم 10% → 18)', () => {
    const r = mapTamimiProduct({
      ...sample,
      variants: [{ storeSpecificData: [{ discount: '10', mrp: '20' }] }],
    })!;
    expect(r.price).toBe(18);
  });

  it('يتجاهل منتجاً بلا سعر متجر (لا storeSpecificData)', () => {
    expect(mapTamimiProduct({ name: 'X', variants: [{ images: [] }] })).toBeNull();
    expect(mapTamimiProduct({ variants: [] })).toBeNull();
  });
});
