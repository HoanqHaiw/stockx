/**
 * Đo hiệu năng các truy vấn báo cáo trên dữ liệu lớn.
 *
 *   npm run bench -w apps/api            (mặc định 500.000 dòng sổ kho)
 *   BENCH_ROWS=1000000 npm run bench -w apps/api
 *
 * Dùng CSDL riêng vattu_hub_bench (tự tạo, không đụng dữ liệu dev). Sinh dữ liệu bằng generate_series trong
 * PostgreSQL, rồi đo thẻ kho, báo cáo nhập – xuất – tồn và bảng tồn: có index và khi tạm bỏ index của sổ kho.
 */
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const ROWS = Number(process.env.BENCH_ROWS ?? 500_000);
const MATERIALS = 300;
const WAREHOUSES = 5;
const DOCS = 40_000;
const base = (process.env.DATABASE_URL ?? 'postgresql://vattu:vattu@localhost:5433/vattu_hub').replace(/\/[^/?]+(\?|$)/, '/vattu_hub_bench$1');

// 1. Tạo CSDL benchmark trống và áp migration.
const admin = new PrismaClient({ datasourceUrl: base.replace('/vattu_hub_bench', '/postgres') });
await admin.$executeRawUnsafe('DROP DATABASE IF EXISTS vattu_hub_bench WITH (FORCE)');
await admin.$executeRawUnsafe('CREATE DATABASE vattu_hub_bench');
await admin.$disconnect();
execSync('npx prisma migrate deploy', { stdio: 'ignore', env: { ...process.env, DATABASE_URL: base } });
process.env.DATABASE_URL = base;

const { prisma } = await import('../src/lib/prisma.js');
const { stockCard, stockOverview } = await import('../src/modules/stock/inventory.service.js');
const { inventoryMovement } = await import('../src/modules/finance/reports.service.js');

// 2. Sinh dữ liệu.
const t0 = Date.now();
const runAll = async (sql: string) => {
  for (const stmt of sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(stmt);
};
await runAll(`
  INSERT INTO "User"(email,"passwordHash","fullName",role,"updatedAt") VALUES ('bench@local','x','Bench','ADMIN',now());
  INSERT INTO "Unit"(code,name) VALUES ('CAI','Cái');
  INSERT INTO "MaterialGroup"(code,name) VALUES ('G','Nhóm');
  INSERT INTO "Material"(code,name,"groupId","baseUnitId","purchasePrice","minStock","updatedAt")
    SELECT 'VT-'||g, 'Vật tư '||g, 1, 1, (random()*500000)::int, 50, now() FROM generate_series(1,${MATERIALS}) g;
  INSERT INTO "Warehouse"(code,name) SELECT 'K'||g, 'Kho '||g FROM generate_series(1,${WAREHOUSES}) g;
  INSERT INTO "StockDocument"(code,type,status,"warehouseId","docDate","createdById","createdAt","updatedAt")
    SELECT 'BD-'||g, (ARRAY['RECEIPT','ISSUE','ISSUE','ADJUSTMENT'])[1 + g % 4]::"StockDocumentType", 'POSTED',
           1 + g % ${WAREHOUSES}, now() - (g % 365) * interval '1 day', 1, now(), now()
    FROM generate_series(1,${DOCS}) g;
  INSERT INTO "StockLedger"("materialId","warehouseId","documentId",quantity,"balanceAfter","createdAt")
    SELECT 1 + (random()*(${MATERIALS}-1))::int, 1 + (random()*(${WAREHOUSES}-1))::int, 1 + (random()*(${DOCS}-1))::int,
           CASE WHEN random() < 0.45 THEN (random()*100)::int + 1 ELSE -((random()*40)::int + 1) END, 0,
           now() - random() * interval '365 days'
    FROM generate_series(1,${ROWS});
  INSERT INTO "StockLedger"("materialId","warehouseId","documentId",quantity,"balanceAfter","createdAt")
    SELECT "materialId","warehouseId", 1, 1000000, 0, now() - interval '400 days' FROM "StockLedger" GROUP BY 1,2;
  INSERT INTO "StockBalance"("materialId","warehouseId",quantity,"updatedAt")
    SELECT "materialId","warehouseId", SUM(quantity), now() FROM "StockLedger" GROUP BY 1,2;
  ANALYZE;`);
console.log(`Sinh ${ROWS.toLocaleString('vi-VN')} dòng sổ kho trong ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// 3. Đo: trung vị của 7 lần chạy (bỏ lần khởi động).
async function median(fn: () => Promise<unknown>) {
  await fn();
  const times: number[] = [];
  for (let i = 0; i < 7; i++) {
    const s = performance.now();
    await fn();
    times.push(performance.now() - s);
  }
  return times.sort((a, b) => a - b)[3];
}
const monthAgo = new Date(Date.now() - 30 * 86_400_000);
const cases: [string, () => Promise<unknown>][] = [
  ['Thẻ kho 1 vật tư × 1 kho, 30 ngày', () => stockCard({ materialId: 42, warehouseId: 2, from: monthAgo, to: new Date() })],
  ['Nhập – xuất – tồn 1 kho, 30 ngày', () => inventoryMovement({ from: monthAgo, to: new Date(), warehouseId: 2 })],
  ['Nhập – xuất – tồn tất cả kho, 30 ngày', () => inventoryMovement({ from: monthAgo, to: new Date() })],
  ['Bảng tồn tất cả kho, trang 1', () => stockOverview({ page: 1, pageSize: 30 })],
];

const withIdx: number[] = [];
for (const [, fn] of cases) withIdx.push(await median(fn));

// Tạm bỏ index của sổ kho để so sánh.
const indexes = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
  SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'StockLedger' AND indexname <> 'StockLedger_pkey'`;
for (const i of indexes) await prisma.$executeRawUnsafe(`DROP INDEX "${i.indexname}"`);
await prisma.$executeRawUnsafe('ANALYZE "StockLedger"');
const noIdx: number[] = [];
for (const [, fn] of cases) noIdx.push(await median(fn));
for (const i of indexes) await prisma.$executeRawUnsafe(i.indexdef);

console.log(`\n${'Truy vấn'.padEnd(40)} ${'Có index'.padStart(10)} ${'Không index'.padStart(12)}`);
cases.forEach(([name], k) =>
  console.log(`${name.padEnd(40)} ${`${withIdx[k].toFixed(0)} ms`.padStart(10)} ${`${noIdx[k].toFixed(0)} ms`.padStart(12)}`),
);

await prisma.$disconnect();
const cleanup = new PrismaClient({ datasourceUrl: base.replace('/vattu_hub_bench', '/postgres') });
await cleanup.$executeRawUnsafe('DROP DATABASE IF EXISTS vattu_hub_bench WITH (FORCE)');
await cleanup.$disconnect();
