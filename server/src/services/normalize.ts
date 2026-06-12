// تطبيع الأسماء العربية للمطابقة بين المتاجر (القسم 4 — products.normalized_name)

const ARABIC_DIACRITICS = /[ً-ٰٟـ]/g; // تشكيل + تطويل
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED_INDIC = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeArabic(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(ARABIC_DIACRITICS, '');
  s = s.replace(/[أإآٱ]/g, 'ا');
  s = s.replace(/ة/g, 'ه');
  s = s.replace(/ى/g, 'ي');
  s = s.replace(/ؤ/g, 'و');
  s = s.replace(/ئ/g, 'ي');
  // أرقام هندية → عربية (لاتينية)
  s = s.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)));
  s = s.replace(/[۰-۹]/g, (d) => String(EXTENDED_INDIC.indexOf(d)));
  // إزالة الرموز، إبقاء الحروف العربية واللاتينية والأرقام والنقطة العشرية داخل رقم
  s = s.replace(/(\d)[,،](\d)/g, '$1.$2');
  s = s.replace(/[^؀-ۿa-z0-9.\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** تشابه بسيط (Dice coefficient على ثنائيات الكلمات والحروف) للمطابقة الضبابية */
export function similarity(a: string, b: string): number {
  const na = normalizeArabic(a);
  const nb = normalizeArabic(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    const padded = ` ${s} `;
    for (let i = 0; i < padded.length - 1; i++) {
      const bg = padded.slice(i, i + 2);
      out.set(bg, (out.get(bg) ?? 0) + 1);
    }
    return out;
  };
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let inter = 0;
  let total = 0;
  for (const [bg, n] of ba) {
    inter += Math.min(n, bb.get(bg) ?? 0);
    total += n;
  }
  for (const n of bb.values()) total += n;
  return total === 0 ? 0 : (2 * inter) / total;
}

/**
 * تطبيع اسم سلسلة لتجميع الفروع المكتشفة (القسم 13.1.3):
 * يزيل لاحقات الفروع الشائعة ("فرع ..."، أسماء الأحياء بعد "-") والكلمات العامة.
 */
const CHAIN_NOISE = [
  'هايبر',
  'هايبرماركت',
  'ماركت',
  'سوبرماركت',
  'سوبر',
  'اسواق',
  'أسواق',
  'متجر',
  'متاجر',
  'شركه',
  'hypermarket',
  'supermarket',
  'market',
  'markets',
  'stores',
  'store',
];

export function chainKey(placeName: string): string {
  // اقطع لاحقة الفرع قبل التطبيع (التطبيع يزيل الشرطة): "بنده - حي الروضة" → "بنده"
  const head = placeName.split(/\s+[-–—]\s+|\s+فرع\s+|\s+branch\s+/i)[0]!;
  const s = normalizeArabic(head);
  const words = s.split(' ').filter((w) => !CHAIN_NOISE.includes(w));
  return (words.join(' ') || s).trim();
}

// ---------- استخراج الحجم وتوحيده (سبرنت v2 — جزء 1.2) ----------

export interface ExtractedSize {
  value: number;
  unit: 'لتر' | 'كجم' | 'حبة';
}

const UNIT_MAP: Array<{ pattern: RegExp; unit: ExtractedSize['unit']; factor: number }> = [
  { pattern: /^(لتر|ليتر|ل|l|liter|litre)$/i, unit: 'لتر', factor: 1 },
  { pattern: /^(مل|ملي|ميلي|ml)$/i, unit: 'لتر', factor: 1 / 1000 },
  { pattern: /^(كجم|كيلو|كغ|kg|كيلوجرام|كيلوغرام)$/i, unit: 'كجم', factor: 1 },
  { pattern: /^(جم|جرام|غرام|غم|g|gm|gram)$/i, unit: 'كجم', factor: 1 / 1000 },
  { pattern: /^(حبه|حبات|قطعه|قطع|كيس|اكياس|عبوه|عبوات|لفه|لفات|قرص|اقراص|ورقه)$/i, unit: 'حبة', factor: 1 },
];

/**
 * يستخرج أول (قيمة، وحدة) من اسم منتج ويوحّدها:
 * "٢ لتر" و"2L" و"2000 مل" كلها → { value: 2, unit: 'لتر' }
 */
export function extractSize(name: string): ExtractedSize | null {
  const s = normalizeArabic(name);
  // رقم متبوع بوحدة (بمسافة أو ملاصقة مثل 2l أو 500g)
  const re = /(\d+(?:\.\d+)?)\s*([a-z؀-ۿ]+)/gi;
  for (const m of s.matchAll(re)) {
    const value = parseFloat(m[1]!);
    if (!Number.isFinite(value) || value <= 0) continue;
    for (const u of UNIT_MAP) {
      if (u.pattern.test(m[2]!)) {
        const v = value * u.factor;
        return { value: Math.round(v * 1000) / 1000, unit: u.unit };
      }
    }
  }
  return null;
}
