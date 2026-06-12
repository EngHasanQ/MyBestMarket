// خدمة البحث الموحدة (سبرنت v2 — جزء 4):
// توسعة مرادفات + مطابقة مطبّعة + pg_trgm، بترتيب:
// تغطية كاملة للكلمات > مطابقة مرادف > تشابه ثلاثي > مطابقة علامة

import { inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { extractSize, normalizeArabic, similarity } from './normalize.js';

const MIN_TRGM_SIMILARITY = 0.25;

/** توسعة كلمات الاستعلام بمجموعات المرادفات من القاعدة */
export async function expandQueryTerms(query: string): Promise<string[][]> {
  const tokens = normalizeArabic(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];
  const rows = await db
    .select()
    .from(schema.searchSynonyms)
    .where(inArray(schema.searchSynonyms.term, tokens));
  const groupsByTerm = new Map<string, string>();
  for (const r of rows) groupsByTerm.set(r.term, r.groupKey);
  const groupKeys = [...new Set(rows.map((r) => r.groupKey))];
  const groupMembers = groupKeys.length
    ? await db
        .select()
        .from(schema.searchSynonyms)
        .where(inArray(schema.searchSynonyms.groupKey, groupKeys))
    : [];
  const byGroup = new Map<string, string[]>();
  for (const m of groupMembers) {
    byGroup.set(m.groupKey, [...(byGroup.get(m.groupKey) ?? []), m.term]);
  }
  // لكل كلمة: [الكلمة نفسها، ...مرادفاتها]
  return tokens.map((t) => {
    const g = groupsByTerm.get(t);
    const alts = g ? (byGroup.get(g) ?? []) : [];
    return [...new Set([t, ...alts])];
  });
}

export interface RankableProduct {
  id: number;
  normalizedName: string;
  brand: string | null;
  sizeValue: string | number | null;
  sizeUnit: string | null;
}

/**
 * ترتيب نقي قابل للاختبار: تغطية الكلمات (مع المرادفات) أولاً، ثم تطابق
 * الحجم المطلوب ("٢ لتر")، ثم تشابه ثلاثي، ثم تطابق العلامة وحدها.
 */
export function rankProducts<T extends RankableProduct>(
  query: string,
  termGroups: string[][],
  products: T[],
): T[] {
  const normQ = normalizeArabic(query);
  const wantedSize = extractSize(normQ);
  const brandTokens = termGroups.flat();

  const scored = products.map((p) => {
    const name = p.normalizedName;
    let covered = 0;
    let synonymHit = false;
    for (const alts of termGroups) {
      // كلمة الحجم تُحتسب عبر مطابقة الحجم لا النص
      const hit = alts.find((a) => name.includes(a));
      if (hit) {
        covered++;
        if (hit !== alts[0]) synonymHit = true;
      }
    }
    const coverage = termGroups.length ? covered / termGroups.length : 0;

    let sizeScore = 0;
    if (wantedSize) {
      const pSize =
        p.sizeValue != null && p.sizeUnit
          ? extractSize(`${p.sizeValue} ${p.sizeUnit}`)
          : extractSize(name);
      if (pSize && pSize.unit === wantedSize.unit && Math.abs(pSize.value - wantedSize.value) < 0.001) {
        sizeScore = 1;
      }
    }

    const brandNorm = p.brand ? normalizeArabic(p.brand) : '';
    const brandScore = brandNorm && brandTokens.some((t) => brandNorm.includes(t)) ? 1 : 0;
    const sim = similarity(name, normQ);

    return {
      p,
      score: coverage * 100 + sizeScore * 30 + sim * 20 + brandScore * 10 - (synonymHit ? 1 : 0),
    };
  });

  return scored
    .filter((s) => s.score > 5)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.p);
}

/** البحث الكامل: مرشّحون من SQL ثم ترتيب نقي */
export async function searchProducts(query: string, limit = 60) {
  const termGroups = await expandQueryTerms(query);
  const normQ = normalizeArabic(query);
  if (!normQ) return [];

  const conditions: SQL[] = [
    sql`similarity(${schema.products.normalizedName}, ${normQ}) > ${MIN_TRGM_SIMILARITY}`,
  ];
  for (const alt of new Set(termGroups.flat())) {
    conditions.push(sql`${schema.products.normalizedName} ILIKE ${'%' + alt + '%'}`);
    conditions.push(sql`${schema.products.brand} ILIKE ${'%' + alt + '%'}`);
  }

  const candidates = await db
    .select({
      product: schema.products,
      categoryName: schema.categories.nameAr,
      categoryIcon: schema.categories.icon,
      categorySlug: schema.categories.slug,
    })
    .from(schema.products)
    .innerJoin(schema.categories, sql`${schema.products.categoryId} = ${schema.categories.id}`)
    .where(sql`${ne(schema.products.status, 'merged')} AND (${or(...conditions)})`)
    .limit(300);

  const ranked = rankProducts(
    query,
    termGroups,
    candidates.map((c) => ({
      id: c.product.id,
      normalizedName: c.product.normalizedName,
      brand: c.product.brand,
      sizeValue: c.product.sizeValue,
      sizeUnit: c.product.sizeUnit,
    })),
  );
  const byId = new Map(candidates.map((c) => [c.product.id, c]));
  return ranked.slice(0, limit).map((r) => byId.get(r.id)!);
}
