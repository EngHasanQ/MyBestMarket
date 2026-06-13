// يولّد صورة فاتورة سعودية واقعية (PNG) لاختبار مسار رفع الفاتورة من طرف لطرف.
// الناتج: fixtures/real-receipts/sample-receipt.png — يُلتزم في المستودع.
// التشغيل: node scripts/gen-receipt-fixture.mjs

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), 'fixtures/real-receipts/sample-receipt.png');

// بنود تطابق منتجات البذر (لتُنشئ أدلّة عند المطابقة)
const LINES = [
  ['أرز أبو كاس بسمتي 5 كجم', '52.95'],
  ['حليب المراعي طازج كامل الدسم 2 لتر', '23.00'],
  ['زيت عافية دوار الشمس 1.5 لتر', '24.75'],
  ['بيض الوطنية أبيض 30 حبة', '16.95'],
  ['صابون فيري ليمون 1 لتر', '9.95'],
  ['خبز صامولي وستن 6 حبات', '4.50'],
  ['شيبس ليز ملح 170 جم', '8.50'],
  ['ماء نوفا 330 مل', '19.95'],
  ['موز فلبيني 1 كجم', '6.95'],
  ['تمر سكري فاخر 1 كجم', '29.95'],
];

const rows = LINES.map(
  ([name, price]) =>
    `<div class="row"><span class="nm">${name}</span><span class="pr">${price}</span></div>`,
).join('\n');

const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/>
<style>
  * { font-family: 'Noto Sans Arabic','Tajawal',sans-serif; }
  body { margin:0; background:#fff; color:#000; }
  .receipt { width: 460px; padding: 22px 18px; }
  .center { text-align:center; }
  h1 { font-size: 30px; margin: 0 0 2px; }
  .muted { font-size: 16px; margin: 2px 0; }
  .sep { border-top: 2px dashed #000; margin: 12px 0; }
  .row { display:flex; justify-content:space-between; gap:14px; font-size: 21px; font-weight:700; margin: 12px 0; line-height:1.4; }
  .nm { flex: 1; }
  .pr { white-space:nowrap; }
  .tot { display:flex; justify-content:space-between; font-size:23px; font-weight:800; margin-top:10px; }
</style></head>
<body>
  <div class="receipt">
    <div class="center">
      <h1>بنده</h1>
      <p class="muted">شركة بنده للتجزئة</p>
      <p class="muted">فرع العزيزية - مكة المكرمة</p>
      <p class="muted">الرقم الضريبي: 300055596400003</p>
      <p class="muted">فاتورة ضريبية مبسطة</p>
      <p class="muted">2026-06-08 18:42</p>
    </div>
    <div class="sep"></div>
    ${rows}
    <div class="sep"></div>
    <div class="tot"><span>ضريبة القيمة المضافة 15%</span><span>25.86</span></div>
    <div class="tot"><span>الإجمالي</span><span>197.45</span></div>
    <p class="center muted">شكراً لتسوقكم من بنده</p>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const el = await page.$('.receipt');
await el.screenshot({ path: OUT });
await browser.close();
console.log('✓', OUT, '—', LINES.length, 'بنود');
