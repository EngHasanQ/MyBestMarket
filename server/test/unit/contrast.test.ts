// B1 — قاعدة التباين: كل نص يحقق WCAG AA على سطحه.
// يقرأ رموز "المحيط العميق" من client/src/index.css (حارس ضد الانحراف) ثم
// يتحقق حسابياً من نسبة التباين لكل زوج (نص/سطح) مستخدَم فعلياً في الواجهة.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const cssPath = path.resolve(process.cwd(), '../client/src/index.css');
const css = fs.readFileSync(cssPath, 'utf8');

/** يستخرج قيمة رمز لون من @theme (مثل --color-app: #04293a) */
function token(name: string): string {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`الرمز --color-${name} غير موجود في index.css`);
  return m[1]!.toLowerCase();
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrast(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// الأسطح
const app = token('app');
const surface = token('surface');
const card = token('card');
const nav = token('nav');
const primary = token('primary');
const amber = token('amber');
const danger = token('danger');

// النصوص
const ink = token('ink');
const ink2 = token('ink-2');
const ink3 = token('ink-3');
const sky = token('sky');
const price = token('price');

const AA_TEXT = 4.5; // نص عادي
const AA_UI = 3.0; // عناصر واجهة/نص كبير

// أزواج (وصف، نص، سطح، أدنى نسبة)
const PAIRS: Array<[string, string, string, number]> = [
  // النص الأساسي على كل الأسطح
  ['ink/app', ink, app, AA_TEXT],
  ['ink/surface', ink, surface, AA_TEXT],
  ['ink/card', ink, card, AA_TEXT],
  ['ink/nav', ink, nav, AA_TEXT],
  // النص الثانوي
  ['ink-2/app', ink2, app, AA_TEXT],
  ['ink-2/surface', ink2, surface, AA_TEXT],
  ['ink-2/card', ink2, card, AA_TEXT],
  // النص المعطّل / التبويب غير النشط (عناصر واجهة — عتبة 3.0)
  ['ink-3/nav', ink3, nav, AA_UI],
  ['ink-3/app', ink3, app, AA_UI],
  // اللون المميّز كنص/رابط/تبويب نشط
  ['primary/app', primary, app, AA_TEXT],
  ['primary/card', primary, card, AA_TEXT],
  ['primary/nav', primary, nav, AA_TEXT],
  // الثانوي السماوي (روابط/حداثة)
  ['sky/app', sky, app, AA_TEXT],
  ['sky/card', sky, card, AA_TEXT],
  // العروض الكهرمانية
  ['amber/app', amber, app, AA_TEXT],
  ['amber/card', amber, card, AA_TEXT],
  // الأسعار (مونو)
  ['price/card', price, card, AA_TEXT],
  ['price/app', price, app, AA_TEXT],
  // الأخطاء — نص الخطأ يظهر على القاعدة الداكنة (زر danger خلفيته bg-app)
  ['danger/app', danger, app, AA_TEXT],
  // نص داكن على أزرار/رقائق ملونة (نص الزر الرئيسي #app على تيل، توست على كهرماني/أحمر)
  ['app-on-primary', app, primary, AA_TEXT],
  ['app-on-amber', app, amber, AA_TEXT],
  ['app-on-danger', app, danger, AA_TEXT],
];

describe('B1 تباين WCAG AA على أزواج الرموز', () => {
  it('الهوية داكنة فعلاً: خلفية التطبيق #04293a', () => {
    expect(app).toBe('#04293a');
    expect(primary).toBe('#2dd4bf');
  });

  for (const [label, fg, bg, min] of PAIRS) {
    it(`${label} ≥ ${min}:1`, () => {
      const ratio = contrast(fg, bg);
      expect(ratio, `${label} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
    });
  }
});
