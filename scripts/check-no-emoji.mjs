// فحص CI (جزء 5.4): لا إيموجي في واجهة المستخدم إطلاقاً
// يفشل البناء إذا وُجد أي محرف من نطاقات الإيموجي في client/src

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'client/src');
// نطاقات العرض الرمزي (إيموجي) — لا تشمل علامات الترقيم العربية
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/u;

let failures = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(tsx?|css|html)$/.test(entry.name)) continue;
    const lines = fs.readFileSync(full, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const m = line.match(EMOJI_RE);
      if (m) {
        failures++;
        console.error(`${path.relative(process.cwd(), full)}:${i + 1} → "${m[0]}"`);
      }
    });
  }
}

walk(ROOT);
if (failures > 0) {
  console.error(`\n✗ وُجد ${failures} إيموجي في الواجهة — استبدلها بأيقونات lucide`);
  process.exit(1);
}
console.log('✓ لا إيموجي في الواجهة');
