import { describe, expect, it } from 'vitest';
import { parseFlyerText } from '../../src/services/ocr/flyerParser.js';
import {
  decodeZatcaQr,
  encodeZatcaQr,
  parseReceiptText,
} from '../../src/services/ocr/receiptParser.js';

describe('parseFlyerText', () => {
  it('يستخرج (اسم، سعر) من أسطر المجلة ويتجاهل الضجيج', () => {
    const text = [
      'عروض الأسبوع — العثيم',
      'أرز أبو كاس بسمتي 5 كجم 52.95 ر.س',
      'زيت عافية ١.٥ لتر ٢٤٫٧٥ ريال',
      'حليب المراعي 2 لتر 11.50',
      '#### ----',
      'صفحة 3',
    ].join('\n');
    const out = parseFlyerText(text);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ price: 52.95 });
    expect(out[0]!.productName).toContain('كاس');
    expect(out[1]!.price).toBe(24.75); // أرقام هندية + فاصلة ٫
    expect(out[2]!.price).toBe(11.5);
  });

  it('يرفض الأسعار غير المنطقية وأسطر بلا اسم', () => {
    const out = parseFlyerText('99999 ر.س\nاب 5\nمنتج جيد جداً 0 ر.س');
    expect(out).toHaveLength(0);
  });
});

describe('parseReceiptText', () => {
  const receipt = [
    'بنده العزيزية',
    'الرقم الضريبي: 300055596400003',
    '2026-06-08 18:42',
    'أرز أبو كاس بسمتي 5 كجم  52.95',
    'حليب المراعي 2 لتر  2 x 11.50  23.00',
    'صابون فيري ليمون  9.95',
    'ضريبة القيمة المضافة 15%  12.89',
    'الإجمالي  98.79',
  ].join('\n');

  it('يقرأ المتجر والتاريخ والبنود والإجمالي', () => {
    const r = parseReceiptText(receipt);
    expect(r.storeName).toContain('بنده');
    expect(r.datetime?.getFullYear()).toBe(2026);
    expect(r.total).toBe(98.79);
    expect(r.lines).toHaveLength(3);
    expect(r.lines[0]).toMatchObject({ quantity: 1, unitPrice: 52.95 });
    // بند بكمية: 2 × 11.50
    expect(r.lines[1]).toMatchObject({ quantity: 2, unitPrice: 11.5 });
  });

  it('يتجاوز أسطر الضريبة والفاتورة والهاتف', () => {
    const r = parseReceiptText('فاتورة ضريبية مبسطة\nهاتف 0125555555\nماء نوفا 330 مل  7.50');
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]!.unitPrice).toBe(7.5);
  });
});

describe('ZATCA QR (TLV/Base64)', () => {
  it('ترميز ثم فك = نفس الحقول', () => {
    const qr = {
      sellerName: 'شركة بنده للتجزئة',
      vatNumber: '300055596400003',
      timestamp: '2026-06-08T18:42:00Z',
      total: '98.79',
      vat: '12.89',
    };
    const decoded = decodeZatcaQr(encodeZatcaQr(qr));
    expect(decoded).toEqual(qr);
  });

  it('بيانات تالفة → null', () => {
    expect(decodeZatcaQr('ليس-base64!')).toBeNull();
    expect(decodeZatcaQr(Buffer.from('غير tlv').toString('base64'))).toBeNull();
  });
});
