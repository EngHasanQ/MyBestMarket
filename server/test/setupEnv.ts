process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://waffir:waffir@localhost:5432/waffir_test';
process.env.JWT_SECRET = 'test-secret';
