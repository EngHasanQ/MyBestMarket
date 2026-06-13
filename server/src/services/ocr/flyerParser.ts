// استخراج مرشّحي (منتج، سعر) من نص OCR لمجلة عروض (القسم 2.2 / A2)

export interface FlyerCandidate {
  rawText: string;
  productName: string;
  price: number; // سعر الوحدة (للعروض المجمّعة "N بـ M" = M/N)
}

// سعر: رقم بفاصلة عشرية اختيارية، مع/بدون "ر.س" أو "ريال" أو SAR
const PRICE_TOKEN = /(\d{1,4}(?:[.,٫]\d{1,2})?)\s*(?:ر\.?\s?س|ريال|sar|sr)?/i;
// عرض مجمّع: "2 بـ 15" أو "٢ ب ١٥" (عدد قطع مقابل سعر إجمالي)
const BUNDLE = /(\d{1,2})\s*ب\s*ـ?\s*(\d{1,4}(?:[.,٫]\d{1,2})?)/;

export function toLatinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

const num = (s: string) => parseFloat(s.replace(/[,٫]/, '.'));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * يحلل سطراً واحداً: يتطلب اسماً عربياً معقولاً وسعراً → مرشّح، وإلا null.
 * يدعم العروض المجمّعة "N بـ M" (سعر الوحدة = M/N) والأرقام العربية والفاصلة ٫.
 */
export function parseFlyerLine(rawLine: string): FlyerCandidate | null {
  const line = toLatinDigits(rawLine).trim();
  if (line.length < 4) return null;

  // 1) عرض مجمّع "N بـ M" له الأولوية (السعر = الإجمالي ÷ العدد)
  const bundle = line.match(BUNDLE);
  if (bundle) {
    const qty = parseInt(bundle[1]!, 10);
    const total = num(bundle[2]!);
    if (qty >= 1 && Number.isFinite(total) && total > 0 && total <= 999) {
      const name = cleanName(line.slice(0, bundle.index));
      if (validName(name)) {
        return { rawText: rawLine.trim(), productName: name, price: round2(total / qty) };
      }
    }
  }

  // 2) السعر = آخر رقم في السطر (يُكتب بجوار المنتج)
  const matches = [...line.matchAll(new RegExp(PRICE_TOKEN.source, 'gi'))];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]!;
  const price = num(last[1]!);
  if (!Number.isFinite(price) || price <= 0 || price > 999) return null;

  const name = cleanName(line.slice(0, last.index));
  if (!validName(name)) return null;

  // ضد الضجيج (أرقام صفحات): سعر صحيح بلا عملة ولا كسور يتطلب اسماً ≥ كلمتين
  const hasCurrencyOrDecimal =
    /ر\.?\s?س|ريال|sar|sr/i.test(last[0]!) || /[.,٫]/.test(last[1]!);
  if (!hasCurrencyOrDecimal && name.split(' ').length < 2) return null;

  return { rawText: rawLine.trim(), productName: name, price };
}

function cleanName(s: string): string {
  return s
    .replace(/[|•·_*#:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validName(name: string): boolean {
  // يلزم اسم فيه 4 أحرف عربية/لاتينية على الأقل
  const letters = name.match(/[؀-ۿa-zA-Z]/g)?.length ?? 0;
  return letters >= 4;
}

/**
 * يحلل نص OCR كامل سطراً سطراً (واجهة المجلات النصية المباشرة).
 */
export function parseFlyerText(text: string): FlyerCandidate[] {
  const out: FlyerCandidate[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const c = parseFlyerLine(rawLine);
    if (c) out.push(c);
  }
  return out;
}

// ---------- تواريخ صلاحية العروض من الغلاف ----------

const AR_MONTHS: Record<string, number> = {
  يناير: 0, فبراير: 1, مارس: 2, ابريل: 3, أبريل: 3, مايو: 4, يونيو: 5, يونية: 5,
  يوليو: 6, يولية: 6, اغسطس: 7, أغسطس: 7, سبتمبر: 8, اكتوبر: 9, أكتوبر: 9,
  نوفمبر: 10, ديسمبر: 11,
};

export interface FlyerValidity {
  startsAt: Date | null;
  endsAt: Date | null;
}

/**
 * يستخرج فترة صلاحية ميلادية من نص الغلاف، مثل:
 *  "من 13 يونيو إلى 19 يونيو 2026" أو "سارية حتى 19 يونيو 2026".
 * يعيد {startsAt, endsAt} (قد يكونان null إن تعذّر).
 */
export function parseValidity(text: string): FlyerValidity {
  const t = toLatinDigits(text);
  const monthAlt = Object.keys(AR_MONTHS).join('|');
  // يوم + شهر (+ سنة اختيارية)
  const dateRe = new RegExp(`(\\d{1,2})\\s*(${monthAlt})\\s*(\\d{4})?`, 'g');
  const hits = [...t.matchAll(dateRe)].map((m) => ({
    day: parseInt(m[1]!, 10),
    month: AR_MONTHS[m[2]!]!,
    year: m[3] ? parseInt(m[3], 10) : undefined,
  }));
  if (hits.length === 0) return { startsAt: null, endsAt: null };

  // السنة: آخر سنة مذكورة تُطبَّق على ما قبلها إن نقصت
  const year = hits.find((h) => h.year)?.year ?? new Date().getFullYear();
  const toDate = (h: { day: number; month: number; year?: number }) =>
    new Date(Date.UTC(h.year ?? year, h.month, h.day));

  if (hits.length >= 2) {
    return { startsAt: toDate(hits[0]!), endsAt: toDate(hits[hits.length - 1]!) };
  }
  return { startsAt: null, endsAt: toDate(hits[0]!) };
}
