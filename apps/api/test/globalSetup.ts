import { execSync } from 'node:child_process';

/**
 * Áp dụng migration mới nhất lên CSDL test trước khi chạy test.
 * Dữ liệu được xoá sạch trong từng test bằng resetDb(), nên không cần reset cả CSDL.
 */
export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://vattu:vattu@localhost:5433/vattu_hub_test?schema=public';
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url },
  });
}
