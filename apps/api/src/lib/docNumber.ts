import type { Tx } from './prisma.js';

/**
 * Sinh số chứng từ tăng dần, không trùng kể cả khi nhiều request chạy song song.
 * Dùng một câu UPSERT ... RETURNING nên việc tăng bộ đếm là nguyên tử.
 * Ví dụ: nextDocNumber(tx, 'PN') -> "PN-2026-0001".
 */
export async function nextDocNumber(tx: Tx, prefix: string, date = new Date()): Promise<string> {
  const key = `${prefix}-${date.getFullYear()}`;
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "DocumentSequence" ("key", "lastValue") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "lastValue" = "DocumentSequence"."lastValue" + 1
    RETURNING "lastValue"`;
  return `${key}-${String(rows[0].lastValue).padStart(4, '0')}`;
}
