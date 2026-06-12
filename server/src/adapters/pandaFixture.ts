/**
 * محوّل بنده — نسخة fixtures.
 * ملاحظة امتثال: موقع بنده الفعلي خلف حماية ضد الروبوتات وشروط استخدامه
 * لا تسمح بالكشط الآلي الصريح؛ لذلك يعمل هذا المحوّل على بيانات fixture
 * (نفس شكل الاستجابة) حتى يُتاح مصدر رسمي. لا تستبدله بكشط مباشر
 * دون مراجعة robots.txt وشروط الاستخدام.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawOffer, RawProduct, StoreAdapter } from './types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(here, '../../fixtures/panda-catalog.json');

interface FixtureFile {
  cities: string[];
  catalog: Array<{ name: string; brand?: string; price: number; barcode?: string }>;
  offers: Array<{ name: string; brand?: string; price: number; endsInDays: number }>;
}

function loadFixture(): FixtureFile {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as FixtureFile;
}

export const pandaAdapter: StoreAdapter = {
  storeSlug: 'panda',
  async supportsCity(cityCode: string) {
    return loadFixture().cities.includes(cityCode);
  },
  async fetchCatalog(): Promise<RawProduct[]> {
    return loadFixture().catalog.map((p) => ({
      rawName: p.name,
      brand: p.brand ?? null,
      barcode: p.barcode ?? null,
      price: p.price,
      basis: 'online' as const,
    }));
  },
  async fetchOffers(): Promise<RawOffer[]> {
    return loadFixture().offers.map((o) => ({
      rawName: o.name,
      brand: o.brand ?? null,
      price: o.price,
      basis: 'shelf' as const,
      offerEndsAt: new Date(Date.now() + o.endsInDays * 86_400_000),
    }));
  },
};
