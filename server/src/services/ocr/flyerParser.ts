// استخراج مرشّحي (منتج، سعر) من نص OCR لمجلة عروض (القسم 2.2)

export interface FlyerCandidate {
  rawText: string;
  productName: string;
  price: number;
}

// سعر: رقم بفاصلة عشرية اختيارية، مع/بدون "ر.س" أو "ريال" أو SAR
const PRICE_TOKEN = /(\d{1,4}(?:[.,٫]\d{1,2})?)\s*(?:ر\.?\s?س|ريال|sar|sr)?/i;

function toLatinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

/**
 * يحلل نص OCR سطراً سطراً: سطر يحوي اسماً عربياً وسعراً → مرشّح.
 * تتسامح مع ضجيج OCR وتتجاهل الأسطر بلا اسم منتج معقول.
 */
export function parseFlyerText(text: string): FlyerCandidate[] {
  const out: FlyerCandidate[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = toLatinDigits(rawLine).trim();
    if (line.length < 4) continue;

    // السعر عادةً آخر رقم في السطر (الأسعار في المجلات تُكتب بجوار المنتج)
    const matches = [...line.matchAll(new RegExp(PRICE_TOKEN.source, 'gi'))];
    if (matches.length === 0) continue;
    const last = matches[matches.length - 1]!;
    const price = parseFloat(last[1]!.replace(/[,٫]/, '.'));
    if (!Number.isFinite(price) || price <= 0 || price > 5000) continue;

    // الاسم = السطر بدون رمز السعر وذيله
    const name = line
      .slice(0, last.index)
      .replace(/[|•·_*#:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // يلزم اسم فيه 4 أحرف عربية/لاتينية على الأقل
    const letters = name.match(/[؀-ۿa-zA-Z]/g)?.length ?? 0;
    if (letters < 4) continue;

    out.push({ rawText: rawLine.trim(), productName: name, price });
  }
  return out;
}
