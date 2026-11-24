import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://vattu:vattu@localhost:5433/vattu_hub_test?schema=public';

export default defineConfig({
  test: {
    globalSetup: './test/globalSetup.ts',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'test-secret-test-secret-test-secret-123456',
    },
    // Các file test dùng chung một CSDL nên chạy tuần tự.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
