// خط اكتشاف المتاجر حسب المدينة عبر Google Places (القسم 13 من الملحق)

import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { chainKey, similarity } from './normalize.js';

export interface PlaceResult {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  types: string[];
  website?: string | null;
  phone?: string | null;
  rating?: number | null;
  userRatingsTotal?: number | null;
}

const SEARCH_TYPES = ['supermarket', 'grocery_store', 'convenience_store'];
const ARABIC_QUERIES = ['هايبر ماركت', 'أسواق', 'تموينات', 'مواد غذائية', 'منظفات وبلاستيك'];

/** نقاط شبكة تغطي صندوق إحاطة المدينة (كاش الاستدعاءات شهري — القسم 13.1.4) */
export function gridPoints(city: {
  lat: number;
  lng: number;
  minLat: number | null;
  minLng: number | null;
  maxLat: number | null;
  maxLng: number | null;
}): Array<{ lat: number; lng: number }> {
  const minLat = city.minLat ?? city.lat - 0.05;
  const maxLat = city.maxLat ?? city.lat + 0.05;
  const minLng = city.minLng ?? city.lng - 0.05;
  const maxLng = city.maxLng ?? city.lng + 0.05;
  const pts: Array<{ lat: number; lng: number }> = [];
  for (let lat = minLat; lat <= maxLat; lat += config.discoveryGridStep) {
    for (let lng = minLng; lng <= maxLng; lng += config.discoveryGridStep) {
      pts.push({ lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 });
    }
  }
  return pts;
}

/**
 * تجميع النتائج في سلاسل (القسم 13.1.3): تطبيع الاسم → مفتاح سلسلة؛
 * 14 فرع "بنده" → سلسلة واحدة، والبقالة المفردة تبقى متجراً مستقلاً.
 */
export function clusterChains(places: PlaceResult[]): Map<string, PlaceResult[]> {
  const clusters = new Map<string, PlaceResult[]>();
  for (const p of places) {
    const key = chainKey(p.name);
    // طابق مفتاحاً موجوداً متشابهاً (أخطاء إملائية بين الفروع)
    let target = key;
    for (const existing of clusters.keys()) {
      if (existing === key || similarity(existing, key) >= 0.85) {
        target = existing;
        break;
      }
    }
    const list = clusters.get(target) ?? [];
    list.push(p);
    clusters.set(target, list);
  }
  return clusters;
}

/** عميل Places New API واعٍ بالحصة: يعمل فقط عند توفر المفتاح، وإلا يُرجع [] */
export async function searchPlaces(
  query: { textQuery?: string; type?: string; lat: number; lng: number; radiusM?: number },
  apiKey = config.googleMapsApiKey,
): Promise<PlaceResult[]> {
  if (!apiKey) return [];
  const body = query.textQuery
    ? {
        textQuery: query.textQuery,
        locationBias: {
          circle: { center: { latitude: query.lat, longitude: query.lng }, radius: query.radiusM ?? 2000 },
        },
      }
    : {
        includedTypes: [query.type],
        locationRestriction: {
          circle: { center: { latitude: query.lat, longitude: query.lng }, radius: query.radiusM ?? 2000 },
        },
      };
  const url = query.textQuery
    ? 'https://places.googleapis.com/v1/places:searchText'
    : 'https://places.googleapis.com/v1/places:searchNearby';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.location,places.types,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Places API ${res.status}`);
  const data = (await res.json()) as { places?: any[] };
  return (data.places ?? []).map((p) => ({
    placeId: p.id,
    name: p.displayName?.text ?? '',
    lat: p.location?.latitude ?? 0,
    lng: p.location?.longitude ?? 0,
    types: p.types ?? [],
    website: p.websiteUri ?? null,
    phone: p.nationalPhoneNumber ?? null,
    rating: p.rating ?? null,
    userRatingsTotal: p.userRatingCount ?? null,
  }));
}

export interface DiscoveryStats {
  placesFound: number;
  chains: number;
  newStores: number;
  newBranches: number;
}

/**
 * تشغيل الاكتشاف لمدينة: بحث شبكي → upsert في discovered_places →
 * تجميع سلاسل → إنشاء متاجر/فروع بحالة pending بانتظار تأهيل المصدر.
 * يقبل fixturePlaces للاختبارات وبيئات بلا مفتاح API.
 */
export async function runDiscoveryForCity(
  cityId: number,
  fixturePlaces?: PlaceResult[],
): Promise<DiscoveryStats> {
  const city = await db.query.cities.findFirst({ where: eq(schema.cities.id, cityId) });
  if (!city) throw new Error(`city ${cityId} not found`);

  let places: PlaceResult[];
  if (fixturePlaces) {
    places = fixturePlaces;
  } else {
    const seen = new Map<string, PlaceResult>();
    for (const pt of gridPoints(city)) {
      for (const type of SEARCH_TYPES) {
        for (const p of await searchPlaces({ type, lat: pt.lat, lng: pt.lng })) seen.set(p.placeId, p);
      }
      for (const q of ARABIC_QUERIES) {
        for (const p of await searchPlaces({ textQuery: q, lat: pt.lat, lng: pt.lng }))
          seen.set(p.placeId, p);
      }
    }
    places = [...seen.values()];
  }

  // upsert في discovered_places (الإدخالات المكتشفة سابقاً تحافظ على حالتها)
  for (const p of places) {
    await db
      .insert(schema.discoveredPlaces)
      .values({
        placeId: p.placeId,
        cityId,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        types: p.types,
        website: p.website ?? null,
        phone: p.phone ?? null,
        rating: p.rating ?? null,
        userRatingsTotal: p.userRatingsTotal ?? null,
        raw: p as unknown as Record<string, unknown>,
        status: 'pending',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.discoveredPlaces.placeId,
        set: {
          name: p.name,
          website: p.website ?? null,
          rating: p.rating ?? null,
          userRatingsTotal: p.userRatingsTotal ?? null,
          updatedAt: new Date(),
        },
      });
  }

  // تجميع السلاسل وإنشاء المتاجر والفروع
  const clusters = clusterChains(places);
  let newStores = 0;
  let newBranches = 0;
  for (const [key, members] of clusters) {
    const display = members[0]!.name;
    const slug = key.replace(/\s+/g, '-') || members[0]!.placeId.toLowerCase();
    let store = await db.query.stores.findFirst({ where: eq(schema.stores.slug, slug) });
    if (!store) {
      const [created] = await db
        .insert(schema.stores)
        .values({
          nameAr: members.length > 1 ? key : display,
          slug,
          type: members.length > 1 ? 'supermarket' : 'grocery',
        })
        .returning();
      store = created!;
      newStores++;
    }
    for (const m of members) {
      await db
        .update(schema.discoveredPlaces)
        .set({ chainStoreId: store.id })
        .where(eq(schema.discoveredPlaces.placeId, m.placeId));
      const existing = await db.query.storeBranches.findFirst({
        where: and(
          eq(schema.storeBranches.storeId, store.id),
          eq(schema.storeBranches.nameAr, m.name),
        ),
      });
      if (!existing) {
        await db.insert(schema.storeBranches).values({
          storeId: store.id,
          cityId,
          nameAr: m.name,
          lat: m.lat,
          lng: m.lng,
          // الفروع تُفعَّل فقط بعد تأهيل مصدر السلسلة وتأكيد الأدمن (قسم 13.2)
          isActive: false,
        });
        newBranches++;
      }
    }
  }
  return { placesFound: places.length, chains: clusters.size, newStores, newBranches };
}
