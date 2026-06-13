// فحص CI (سبرنت v3 / B3): لا بقايا للهوية الخضراء/الكريمية
// يفشل البناء إذا وُجد أي رمز لون من السمة القديمة في كود العميل.
// الهوية الجديدة "المحيط العميق" داكنة بالكامل — مصدرها الوحيد client/src/index.css.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'client');

// ألوان السمة القديمة (أخضر/كريمي) — يجب ألا تظهر إطلاقاً
const FORBIDDEN = [
  /#1b7a43/i, // الأخضر الأساسي
  /#135c32/i, // الأخضر الداكن
  /#e8f3ed/i, // أخضر فاتح
  /#faf8f4/i, // الكريمي (خلفية)
  /#faf9f6/i, // كريمي بديل
  /#fdf3e3/i, // كهرماني فاتح قديم
];

const EXTS = /\.(tsx?|css|html|ts)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dev-dist', '.vite']);

let failures = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!EXTS.test(entry.name)) continue;
    const lines = fs.readFileSync(full, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const re of FORBIDDEN) {
        const m = line.match(re);
        if (m) {
          failures++;
          console.error(`${path.relative(process.cwd(), full)}:${i + 1} → "${m[0]}"`);
        }
      }
    });
  }
}

walk(ROOT);
if (failures > 0) {
  console.error(`\n✗ وُجد ${failures} لون من السمة الخضراء/الكريمية القديمة — استبدله برموز المحيط العميق`);
  process.exit(1);
}
console.log('✓ لا بقايا للسمة القديمة — الهوية داكنة بالكامل');
