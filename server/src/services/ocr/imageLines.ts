// أدوات OCR على مستوى الأسطر مع صناديق إحاطة + قصّ مناطق — مشتركة بين
// خط المجلات (قصاصة المنتج) وخط الفواتير (تظليل سطر البند المطابق).

import { saveEvidenceImage } from '../evidence.js';
import { logger } from '../../logger.js';

export interface OcrLine {
  text: string;
  box: [number, number, number, number]; // [x0,y0,x1,y1] بالبكسل
}

interface Word {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// عامل OCR مُعاد الاستخدام (تهيئته مكلفة)
let sharedWorker: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | null = null;
async function getWorker() {
  if (!sharedWorker) {
    const { createWorker } = await import('tesseract.js');
    sharedWorker = await createWorker(['ara', 'eng']);
  }
  return sharedWorker;
}

export async function shutdownImageOcr() {
  if (sharedWorker) {
    await sharedWorker.terminate();
    sharedWorker = null;
  }
}

/** OCR صورة → كلمات بصناديق إحاطة بالبكسل */
async function ocrWords(image: string | Buffer): Promise<Word[]> {
  const worker = await getWorker();
  const { data } = await worker.recognize(image);
  const words = (data.words ?? []) as Array<{
    text?: string;
    bbox?: { x0: number; y0: number; x1: number; y1: number };
  }>;
  return words
    .filter((w) => w.text && w.text.trim() && w.bbox)
    .map((w) => ({ text: w.text!.trim(), x0: w.bbox!.x0, y0: w.bbox!.y0, x1: w.bbox!.x1, y1: w.bbox!.y1 }));
}

/** يجمع الكلمات في أسطر حسب المركز الرأسي ويرتّب كل سطر من اليمين لليسار (RTL) */
export function groupWordsIntoLines(words: Word[]): OcrLine[] {
  const sorted = [...words].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const lines: Array<{ cy: number; h: number; words: Word[] }> = [];
  for (const w of sorted) {
    const cy = (w.y0 + w.y1) / 2;
    const h = w.y1 - w.y0;
    let line = lines.find((l) => Math.abs(l.cy - cy) < Math.max(h, l.h) * 0.6);
    if (!line) {
      line = { cy, h, words: [] };
      lines.push(line);
    }
    line.words.push(w);
    line.cy = (line.cy * (line.words.length - 1) + cy) / line.words.length;
  }
  return lines.map((l) => {
    l.words.sort((a, b) => b.x0 - a.x0); // RTL: الأيمن أولاً
    const xs = l.words.flatMap((w) => [w.x0, w.x1]);
    const ys = l.words.flatMap((w) => [w.y0, w.y1]);
    return {
      text: l.words.map((w) => w.text).join(' '),
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as [
        number,
        number,
        number,
        number,
      ],
    };
  });
}

/** OCR صورة وإرجاع أسطرها (نص + صندوق) جاهزة للتحليل والقصّ */
export async function ocrImageLines(image: string | Buffer): Promise<OcrLine[]> {
  return groupWordsIntoLines(await ocrWords(image));
}

/** قصّ منطقة (صندوق) من صورة وحفظها دليلاً؛ يعيد اسم الملف أو null */
export async function cropImageRegion(
  image: string | Buffer,
  box: [number, number, number, number],
  pad = 10,
): Promise<string | null> {
  try {
    const { default: sharp } = await import('sharp');
    const meta = await sharp(image).metadata();
    const left = Math.max(0, Math.round(box[0]) - pad);
    const top = Math.max(0, Math.round(box[1]) - pad);
    const width = Math.min((meta.width ?? 0) - left, Math.round(box[2] - box[0]) + pad * 2);
    const height = Math.min((meta.height ?? 0) - top, Math.round(box[3] - box[1]) + pad * 2);
    if (width < 8 || height < 8) return null;
    const buf = await sharp(image).extract({ left, top, width, height }).png().toBuffer();
    return saveEvidenceImage(buf, '.png');
  } catch (err) {
    logger.debug({ err: String(err) }, 'crop region failed');
    return null;
  }
}
