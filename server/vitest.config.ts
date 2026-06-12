import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // قاعدة اختبار واحدة مشتركة — لا تشغيل متوازٍ للملفات
    fileParallelism: false,
    globalSetup: ['./test/globalSetup.ts'],
    setupFiles: ['./test/setupEnv.ts'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/services/**'],
    },
  },
});
