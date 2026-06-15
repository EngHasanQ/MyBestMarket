// اكتشاف متاجر المقاضي مجاناً عبر OpenStreetMap (Overpass API) — بلا مفتاح.
// يقرأ shop=supermarket|convenience|grocery داخل صندوق إحاطة المدينة، يربط
// الأسماء بالسلاسل المعروفة، ويُنشئ متاجر/فروع. بديل مجاني لـ Google Places.

import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { logger } from '../logger.js';

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

interface OsmStore {
  name: string;
  lat: number;
  lng: number;
}

// سلاسل سعودية معروفة: نمط الاسم → (slug، الاسم العربي). الفروع تُنشأ نشطة.
const CHAINS: Array<{ re: RegExp; slug: string; nameAr: string }> = [
  { re: /بن?دة|panda/i, slug: 'panda', nameAr: 'بنده' },
  { re: /عثيم|othaim/i, slug: 'othaim', nameAr: 'العثيم' },
  { re: /دانوب|danube/i, slug: 'danube', nameAr: 'الدانوب' },
  { re: /كارفور|carrefour/i, slug: 'carrefour', nameAr: 'كارفور' },
  { re: /تميمي|tamimi/i, slug: 'tamimi', nameAr: 'التميمي' },
  { re: /لولو|lulu/i, slug: 'lulu', nameAr: 'لولو هايبر ماركت' },
  { re: /بن\s?داود|بن\s?داوود|bin\s?dawood/i, slug: 'bindawood', nameAr: 'بن داوود' },
  { re: /الراية|راية|al[- ]?raya/i, slug: 'alraya', nameAr: 'الراية' },
  { re: /النوري|نوري|al[- ]?noori|nori/i, slug: 'alnoori', nameAr: 'النوري' },
  { re: /الوفاء|wafa/i, slug: 'alwafa', nameAr: 'هايبر الوفاء' },
  { re: /الأبراج|الابراج|abraj/i, slug: 'abraj', nameAr: 'هايبر الأبراج' },
  { re: /المزرعة|farm|مزارع/i, slug: 'farm', nameAr: 'المزرعة' },
  { re: /نستو|nesto/i, slug: 'nesto', nameAr: 'نستو' },
  { re: /كنزي|kenz/i, slug: 'kenz', nameAr: 'كنز' },
  { re: /مانويل|manuel/i, slug: 'manuel', nameAr: 'مانويل' },
  { re: /الدكان|dukan/i, slug: 'aldukan', nameAr: 'الدكان' },
  { re: /سبينس|spinneys/i, slug: 'spinneys', nameAr: 'سبينيس' },
];

function matchChain(name: string) {
  return CHAINS.find((c) => c.re.test(name)) ?? null;
}

/** يستعلم Overpass عن متاجر داخل صندوق المدينة (مع مهلة ومرايا احتياطية) */
async function fetchOsmStores(bbox: [number, number, number, number]): Promise<OsmStore[]> {
  const [minLat, minLng, maxLat, maxLng] = bbox;
  const q = `[out:json][timeout:25];(node["shop"~"supermarket|convenience|grocery"](${minLat},${minLng},${maxLat},${maxLng});way["shop"~"supermarket|convenience|grocery"](${minLat},${minLng},${maxLat},${maxLng}););out center 400;`;
  for (const base of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'WaffirBot/1.0 (+https://waffir.app)',
        },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(35_000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { elements?: any[] };
      return (data.elements ?? [])
        .map((e) => ({
          name: String(e.tags?.name ?? e.tags?.['name:ar'] ?? '').trim(),
          lat: e.lat ?? e.center?.lat ?? 0,
          lng: e.lon ?? e.center?.lon ?? 0,
        }))
        .filter((s) => s.name && s.lat && s.lng);
    } catch (err) {
      logger.debug({ err: String(err) }, 'overpass mirror failed');
    }
  }
  return [];
}

export interface OsmDiscoveryStats {
  found: number;
  chainsMatched: number;
  newStores: number;
  newBranches: number;
}

/**
 * يكتشف فروع المتاجر لمدينة عبر OSM. الفروع للسلاسل المعروفة تُنشأ نشطة
 * (لتظهر فوراً وتستقبل أسعار التميمي/المجلات)، وغير المعروفة تُتجاهل.
 */
export async function discoverViaOSM(cityId: number): Promise<OsmDiscoveryStats> {
  const city = await db.query.cities.findFirst({ where: eq(schema.cities.id, cityId) });
  if (!city) throw new Error(`المدينة ${cityId} غير موجودة`);

  // صندوق المدينة (أو ±0.15° حول مركزها)
  const bbox: [number, number, number, number] = [
    city.minLat ?? city.lat - 0.15,
    city.minLng ?? city.lng - 0.15,
    city.maxLat ?? city.lat + 0.15,
    city.maxLng ?? city.lng + 0.15,
  ];

  const stores = await fetchOsmStores(bbox);
  const stats: OsmDiscoveryStats = { found: stores.length, chainsMatched: 0, newStores: 0, newBranches: 0 };

  for (const s of stores) {
    const chain = matchChain(s.name);
    if (!chain) continue; // نتجاهل البقالات الصغيرة غير المعروفة
    stats.chainsMatched++;

    let store = await db.query.stores.findFirst({ where: eq(schema.stores.slug, chain.slug) });
    if (!store) {
      const [created] = await db
        .insert(schema.stores)
        .values({ nameAr: chain.nameAr, slug: chain.slug, type: 'supermarket' })
        .returning();
      store = created!;
      stats.newStores++;
    }

    // تفادي تكرار الفرع: نفس المتجر/المدينة وموقع قريب (~120م)
    const near = await db
      .select({ id: schema.storeBranches.id })
      .from(schema.storeBranches)
      .where(
        and(
          eq(schema.storeBranches.storeId, store.id),
          eq(schema.storeBranches.cityId, cityId),
          sql`abs(coalesce(lat,0) - ${s.lat}) < 0.0012 AND abs(coalesce(lng,0) - ${s.lng}) < 0.0012`,
        ),
      )
      .limit(1);
    if (near.length > 0) continue;

    const branchName = s.name.length > 2 ? s.name : `${chain.nameAr} - ${city.nameAr}`;
    await db.insert(schema.storeBranches).values({
      storeId: store.id,
      cityId,
      nameAr: branchName,
      lat: s.lat,
      lng: s.lng,
      isActive: true,
    });
    stats.newBranches++;
  }

  return stats;
}
