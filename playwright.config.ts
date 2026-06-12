import { defineConfig, devices } from '@playwright/test';

// E2E على منفذ مستقل: يَبذر القاعدة ثم يشغّل الخادم مع client/dist المبني
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    // عرض جوال 390×844 (القسم 9.3) على كروميوم
    ...devices['Pixel 5'],
    viewport: { width: 390, height: 844 },
    locale: 'ar-SA',
  },
  webServer: {
    command:
      'npm run seed --workspace=server && PORT=3100 APP_ORIGIN=http://localhost:3100 npm run start:e2e --workspace=server',
    url: 'http://localhost:3100/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
