// غلاف tesseract.js (ara+eng) — يُحمَّل كسولاً لأن تهيئة العامل مكلفة

import { createWorker, type Worker } from 'tesseract.js';

let worker: Worker | null = null;

export async function ocrImage(imagePath: string | Buffer): Promise<string> {
  if (!worker) {
    worker = await createWorker(['ara', 'eng']);
  }
  const {
    data: { text },
  } = await worker.recognize(imagePath);
  return text;
}

export async function shutdownOcr() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
