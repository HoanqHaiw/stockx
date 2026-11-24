import { afterAll, beforeEach, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { nextDocNumber } from '../src/lib/docNumber.js';
import { resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

it('sinh số chứng từ không trùng khi chạy song song', async () => {
  const date = new Date('2026-05-01');
  const codes = await Promise.all(
    Array.from({ length: 30 }, () => prisma.$transaction((tx) => nextDocNumber(tx, 'PN', date))),
  );
  const sorted = [...codes].sort();
  expect(new Set(codes).size).toBe(30);
  expect(sorted[0]).toBe('PN-2026-0001');
  expect(sorted[29]).toBe('PN-2026-0030');
});
