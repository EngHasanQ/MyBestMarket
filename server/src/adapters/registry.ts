// سجل المحوّلات: يربط slug المتجر بمحوّله، ويبني محولات سلة ديناميكياً
// من store_source_profiles المؤكدة (platform_hint = salla)

import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { StoreAdapter } from './types.js';
import { pandaAdapter } from './pandaFixture.js';
import { createSallaAdapter } from './sallaStorefront.js';
import { createZidAdapter } from './zidStorefront.js';

const staticAdapters: StoreAdapter[] = [pandaAdapter];

export async function getAdapters(): Promise<Map<number, StoreAdapter>> {
  const out = new Map<number, StoreAdapter>();
  const allStores = await db.select().from(schema.stores);
  const bySlug = new Map(allStores.map((s) => [s.slug, s]));

  for (const a of staticAdapters) {
    const store = bySlug.get(a.storeSlug);
    if (store) out.set(store.id, a);
  }

  // محولات ديناميكية للمصادر المؤكدة من نوع api على منصة سلة
  const profiles = await db
    .select()
    .from(schema.storeSourceProfiles)
    .where(
      and(
        eq(schema.storeSourceProfiles.isConfirmed, true),
        eq(schema.storeSourceProfiles.sourceType, 'api'),
      ),
    );
  for (const p of profiles) {
    if (out.has(p.storeId) || !p.endpointOrUrl) continue;
    const store = allStores.find((s) => s.id === p.storeId);
    if (!store) continue;
    if (p.platformHint === 'salla') {
      out.set(p.storeId, createSallaAdapter(store.slug, p.endpointOrUrl));
    } else if (p.platformHint === 'zid') {
      out.set(p.storeId, createZidAdapter(store.slug, p.endpointOrUrl));
    }
  }
  return out;
}
