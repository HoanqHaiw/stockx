import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { postStockDocument } from '../src/modules/stock/stock.service.js';
import { AppError } from '../src/lib/errors.js';
import { balanceOf, createBasics, draftDoc, resetDb } from './helpers.js';

let ctx: Awaited<ReturnType<typeof createBasics>>;

beforeEach(async () => {
  await resetDb();
  ctx = await createBasics();
});
afterAll(() => prisma.$disconnect());

async function receive(qty: number, warehouseId = ctx.whA.id, materialId = ctx.material.id) {
  const doc = await draftDoc({
    type: 'RECEIPT',
    warehouseId,
    userId: ctx.user.id,
    lines: [{ materialId, unitId: ctx.unit.id, qty }],
  });
  return postStockDocument(doc.id, ctx.user.id);
}

describe('Ghi sổ phiếu kho', () => {
  it('nhập kho làm tăng tồn và ghi một dòng sổ kho', async () => {
    await receive(150);
    expect(await balanceOf(ctx.material.id, ctx.whA.id)).toBe(150);
    const ledger = await prisma.stockLedger.findMany();
    expect(ledger).toHaveLength(1);
    expect(Number(ledger[0].balanceAfter)).toBe(150);
  });

  it('không cho xuất quá số tồn và không ghi gì vào sổ', async () => {
    await receive(10);
    const issue = await draftDoc({
      type: 'ISSUE',
      warehouseId: ctx.whA.id,
      userId: ctx.user.id,
      lines: [{ materialId: ctx.material.id, unitId: ctx.unit.id, qty: 11 }],
    });
    const err = await postStockDocument(issue.id, ctx.user.id).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    const appErr = err as AppError & { details: { items: unknown[] } };
    expect(appErr.status).toBe(409);
    expect(appErr.details.items[0]).toMatchObject({ materialCode: 'DC-CV2.5', available: '10', required: '11' });
    expect(await balanceOf(ctx.material.id, ctx.whA.id)).toBe(10);
    expect(await prisma.stockLedger.count()).toBe(1);
    const after = await prisma.stockDocument.findUniqueOrThrow({ where: { id: issue.id } });
    expect(after.status).toBe('DRAFT');
  });

  it('chuyển kho giảm kho xuất và tăng kho nhận trong cùng một giao dịch', async () => {
    await receive(100);
    const t = await draftDoc({
      type: 'TRANSFER',
      warehouseId: ctx.whA.id,
      toWarehouseId: ctx.whB.id,
      userId: ctx.user.id,
      lines: [{ materialId: ctx.material.id, unitId: ctx.unit.id, qty: 40 }],
    });
    await postStockDocument(t.id, ctx.user.id);
    expect(await balanceOf(ctx.material.id, ctx.whA.id)).toBe(60);
    expect(await balanceOf(ctx.material.id, ctx.whB.id)).toBe(40);
  });

  it('một phiếu chỉ được ghi sổ một lần, kể cả khi bấm hai lần cùng lúc', async () => {
    const doc = await draftDoc({
      type: 'RECEIPT',
      warehouseId: ctx.whA.id,
      userId: ctx.user.id,
      lines: [{ materialId: ctx.material.id, unitId: ctx.unit.id, qty: 5 }],
    });
    const results = await Promise.allSettled([
      postStockDocument(doc.id, ctx.user.id),
      postStockDocument(doc.id, ctx.user.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await balanceOf(ctx.material.id, ctx.whA.id)).toBe(5);
  });

  it('nhiều phiếu xuất chạy song song không bao giờ làm âm kho', async () => {
    await receive(100);
    // 10 phiếu, mỗi phiếu xuất 15: tổng 150 > 100, nên chỉ đúng 6 phiếu được ghi sổ.
    const docs = await Promise.all(
      Array.from({ length: 10 }, () =>
        draftDoc({
          type: 'ISSUE',
          warehouseId: ctx.whA.id,
          userId: ctx.user.id,
          lines: [{ materialId: ctx.material.id, unitId: ctx.unit.id, qty: 15 }],
        }),
      ),
    );
    const results = await Promise.allSettled(docs.map((d) => postStockDocument(d.id, ctx.user.id)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(6);
    expect(await balanceOf(ctx.material.id, ctx.whA.id)).toBe(10);

    // Tổng sổ kho luôn khớp số tồn.
    const sum = await prisma.stockLedger.aggregate({
      _sum: { quantity: true },
      where: { materialId: ctx.material.id, warehouseId: ctx.whA.id },
    });
    expect(Number(sum._sum.quantity)).toBe(10);
  });

  it('chuyển kho chéo chiều chạy song song không bị deadlock', async () => {
    await receive(100, ctx.whA.id);
    await receive(100, ctx.whB.id);
    await receive(100, ctx.whA.id, ctx.material2.id);
    await receive(100, ctx.whB.id, ctx.material2.id);
    const mk = (from: number, to: number) =>
      draftDoc({
        type: 'TRANSFER',
        warehouseId: from,
        toWarehouseId: to,
        userId: ctx.user.id,
        lines: [
          { materialId: ctx.material.id, unitId: ctx.unit.id, qty: 1 },
          { materialId: ctx.material2.id, unitId: ctx.unit.id, qty: 1 },
        ],
      });
    const docs = await Promise.all(
      Array.from({ length: 8 }, (_, i) => (i % 2 ? mk(ctx.whA.id, ctx.whB.id) : mk(ctx.whB.id, ctx.whA.id))),
    );
    const results = await Promise.allSettled(docs.map((d) => postStockDocument(d.id, ctx.user.id)));
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await balanceOf(ctx.material.id, ctx.whA.id)).toBe(100);
    expect(await balanceOf(ctx.material2.id, ctx.whB.id)).toBe(100);
  });

  it('CSDL tự chặn tồn âm kể cả khi bỏ qua service', async () => {
    await receive(5);
    await expect(
      prisma.stockBalance.update({
        where: { materialId_warehouseId: { materialId: ctx.material.id, warehouseId: ctx.whA.id } },
        data: { quantity: -1 },
      }),
    ).rejects.toThrow(/StockBalance_quantity_non_negative/);
  });
});
