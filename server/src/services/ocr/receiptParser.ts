// تحليل فواتير ZATCA: بنود الفاتورة + فك رمز QR (القسم 14.3 من الملحق)

export interface ReceiptLine {
  rawText: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface ParsedReceipt {
  storeName: string | null;
  datetime: Date | null;
  lines: ReceiptLine[];
  total: number | null;
}

function toLatinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

// بند فاتورة شائع: اسم ... كمية x سعر ... إجمالي  أو  اسم ... سعر
const LINE_QTY = /^(.{4,}?)\s+(\d{1,3})\s*[x×*]\s*(\d{1,4}(?:\.\d{1,2})?)\s+(\d{1,5}(?:\.\d{1,2})?)\s*$/;
const LINE_SIMPLE = /^(.{4,}?)\s+(\d{1,4}(?:\.\d{1,2})?)\s*$/;
const TOTAL_HINT = /الإجمالي|الاجمالي|المجموع|total/i;
const DATE_HINT = /(\d{4})[-/](\d{2})[-/](\d{2})[ T]?(\d{2}):(\d{2})/;
const SKIP_HINT = /ضريبة|vat|فاتورة|رقم|هاتف|شكراً|شكرا|فرع|كاشير|نقاط|الرقم الضريبي|tax/i;

/** تحليل نص OCR لفاتورة إلى بنود (اسم/كمية/سعر) — نقي وقابل للاختبار */
export function parseReceiptText(text: string): ParsedReceipt {
  const lines = text.split(/\r?\n/).map((l) => toLatinDigits(l).trim());
  const out: ParsedReceipt = { storeName: null, datetime: null, lines: [], total: null };

  // اسم المتجر = أول سطر غير فارغ فيه حروف
  for (const l of lines) {
    if ((l.match(/[؀-ۿa-zA-Z]/g)?.length ?? 0) >= 3) {
      out.storeName = l;
      break;
    }
  }

  for (const l of lines) {
    if (!l) continue;
    const dm = l.match(DATE_HINT);
    if (dm && !out.datetime) {
      out.datetime = new Date(`${dm[1]}-${dm[2]}-${dm[3]}T${dm[4]}:${dm[5]}:00`);
      continue;
    }
    if (TOTAL_HINT.test(l)) {
      const nums = l.match(/\d{1,6}(?:\.\d{1,2})?/g);
      if (nums) out.total = parseFloat(nums[nums.length - 1]!);
      continue;
    }
    if (SKIP_HINT.test(l)) continue;

    const qm = l.match(LINE_QTY);
    if (qm) {
      out.lines.push({
        rawText: l,
        productName: qm[1]!.trim(),
        quantity: parseInt(qm[2]!, 10),
        unitPrice: parseFloat(qm[3]!),
      });
      continue;
    }
    const sm = l.match(LINE_SIMPLE);
    if (sm) {
      const name = sm[1]!.trim();
      const letters = name.match(/[؀-ۿa-zA-Z]/g)?.length ?? 0;
      const price = parseFloat(sm[2]!);
      if (letters >= 4 && price > 0 && price <= 5000) {
        out.lines.push({ rawText: l, productName: name, quantity: 1, unitPrice: price });
      }
    }
  }
  return out;
}

export interface ZatcaQr {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  total: string;
  vat: string;
}

/**
 * فك رمز ZATCA QR (TLV مرمّز Base64) للتحقق من هوية المتجر وأصالة الفاتورة
 * — مضاد للتلاعب في الإدخال الجماعي (القسم 14.3).
 */
export function decodeZatcaQr(base64: string): ZatcaQr | null {
  let buf: Buffer;
  try {
    buf = Buffer.from(base64.trim(), 'base64');
  } catch {
    return null;
  }
  const fields = new Map<number, string>();
  let i = 0;
  while (i + 2 <= buf.length) {
    const tag = buf[i]!;
    const len = buf[i + 1]!;
    if (i + 2 + len > buf.length) return null;
    fields.set(tag, buf.subarray(i + 2, i + 2 + len).toString('utf8'));
    i += 2 + len;
  }
  if (!fields.has(1) || !fields.has(3)) return null;
  return {
    sellerName: fields.get(1) ?? '',
    vatNumber: fields.get(2) ?? '',
    timestamp: fields.get(3) ?? '',
    total: fields.get(4) ?? '',
    vat: fields.get(5) ?? '',
  };
}

/** ترميز TLV للاختبارات وتوليد بيانات تجريبية */
export function encodeZatcaQr(qr: ZatcaQr): string {
  const tlv = (tag: number, value: string) => {
    const v = Buffer.from(value, 'utf8');
    return Buffer.concat([Buffer.from([tag, v.length]), v]);
  };
  return Buffer.concat([
    tlv(1, qr.sellerName),
    tlv(2, qr.vatNumber),
    tlv(3, qr.timestamp),
    tlv(4, qr.total),
    tlv(5, qr.vat),
  ]).toString('base64');
}
