// حفظ المرفوعات (مجلات/فواتير) على القرص وخدمتها عبر /uploads
// — صورة الدليل التي يشاهدها المستخدم بجانب السعر

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.resolve(here, '../uploads');

export function saveUpload(buffer: Buffer, originalName: string): string {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const ext = (path.extname(originalName) || '.jpg').toLowerCase().slice(0, 8);
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, name), buffer);
  return `/uploads/${name}`;
}
