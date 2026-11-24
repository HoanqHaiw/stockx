import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma, type Tx } from '../../lib/prisma.js';
import { badRequest } from '../../lib/errors.js';
import { nextDocNumber } from '../../lib/docNumber.js';
import { optionalText } from '../../lib/query.js';
import { postStockDocumentTx } from './stock.service.js';

const D = Prisma.Decimal;

// ───────────────────────── Chuyển kho ─────────────────────────

export const transferSchema = z
  .object({
    fromWarehouseId: z.coerce.number().int().positive('Vui lòng chọn kho xuất'),
    toWarehouseId: z.coerce.number().int().positive('Vui lòng chọn kho nhận'),
    note: optionalText(500),
    lines: z
      .array(
        z.object({
          materialId: z.coerce.number().int().positive('Vui lòng chọn vật tư'),
          unitId: z.coerce.number().int().positive(),
          quantity: z.coerce.number().positive('Số lượng phải lớn hơn 0').max(1e9),
        }),
      )
      .min(1, 'Phiếu chuyển cần ít nhất một dòng vật tư')
      .max(200),
  })
  .refine((t) => t.fromWarehouseId !== t.toWarehouseId, {
    path: ['toWarehouseId'],
    message: 'Kho nhận phải khác kho xuất',
  });
export type TransferInput = z.infer<typeof transferSchema>;

async function assertActiveWarehouses(tx: Tx, ids: number[]) {
  const found = await tx.warehouse.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
  if (found.length !== new Set(ids).size) throw badRequest('Kho không tồn tại hoặc đã ngừng sử dụng');
}

/** Chuyển hàng giữa hai kho: một phiếu TRANSFER, ghi sổ ngay (trừ kho xuất, cộng kho nhận). */
export function createTransfer(input: TransferInput, userId: number) {
  return prisma.$transaction(
    async (tx) => {
      await assertActiveWarehouses(tx, [input.fromWarehouseId, input.toWarehouseId]);
      const materials = await tx.material.findMany({
        where: { id: { in: input.lines.map((l) => l.materialId) } },
        include: { conversions: true },
      });
      const byId = new Map(materials.map((m) => [m.id, m]));
      const lines = input.lines.map((l, i) => {
        const m = byId.get(l.materialId);
        if (!m) throw badRequest(`Dòng ${i + 1}: vật tư không tồn tại`);
        const factor = l.unitId === m.baseUnitId ? new D(1) : m.conversions.find((c) => c.unitId === l.unitId)?.factor;
        if (!factor) throw badRequest(`Dòng ${i + 1}: đơn vị tính không áp dụng cho vật tư ${m.code}`);
        const quantity = new D(l.quantity);
        // Ghi giá trị theo giá mua để biết lượng hàng đang nằm ở công trình trị giá bao nhiêu.
        const unitPrice = m.purchasePrice.mul(factor).toDecimalPlaces(0);
        return {
          materialId: m.id,
          unitId: l.unitId,
          factor,
          quantity,
          baseQuantity: quantity.mul(factor).toDecimalPlaces(3),
          unitPrice,
          amount: quantity.mul(unitPrice).toDecimalPlaces(0),
        };
      });
      const doc = await tx.stockDocument.create({
        data: {
          code: await nextDocNumber(tx, 'PC'),
          type: 'TRANSFER',
          warehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          note: input.note,
          totalAmount: lines.reduce((s, l) => s.plus(l.amount), new D(0)),
          createdById: userId,
          lines: { create: lines },
        },
      });
      return postStockDocumentTx(tx, doc.id, userId);
    },
    { timeout: 20_000 },
  );
}

// ───────────────────────── Kiểm kê ─────────────────────────

export const stockCountSchema = z.object({
  warehouseId: z.coerce.number().int().positive('Vui lòng chọn kho kiểm kê'),
  note: optionalText(500),
  lines: z
    .array(
      z.object({
        materialId: z.coerce.number().int().positive(),
        countedQty: z.coerce.number().min(0, 'Số đếm không được âm').max(1e12), // đơn vị cơ sở
      }),
    )
    .min(1, 'Chưa nhập số đếm cho vật tư nào')
    .max(2000)
    .refine((ls) => new Set(ls.map((l) => l.materialId)).size === ls.length, 'Một vật tư bị nhập hai lần'),
});
export type StockCountInput = z.infer<typeof stockCountSchema>;

/**
 * Ghi nhận kiểm kê: thủ kho nhập số đếm thực tế, hệ thống so với tồn sổ sách
 * NGAY TẠI THỜI ĐIỂM GHI (đã khoá dòng tồn) và tạo phiếu điều chỉnh phần chênh lệch.
 * Nhờ khoá dòng, phiếu nhập/xuất phát sinh trong lúc kiểm kê không làm sai chênh lệch.
 */
export function createStockCount(input: StockCountInput, userId: number) {
  return prisma.$transaction(
    async (tx) => {
      await assertActiveWarehouses(tx, [input.warehouseId]);
      const materials = await tx.material.findMany({
        where: { id: { in: input.lines.map((l) => l.materialId) } },
        select: { id: true, baseUnitId: true, purchasePrice: true },
      });
      if (materials.length !== input.lines.length) throw badRequest('Có vật tư không tồn tại');
      const byId = new Map(materials.map((m) => [m.id, m]));

      // Khoá tồn theo thứ tự vật tư tăng dần (cùng thứ tự với service ghi sổ để tránh deadlock).
      const sorted = [...input.lines].sort((a, b) => a.materialId - b.materialId);
      const book = new Map<number, Prisma.Decimal>();
      for (const l of sorted) {
        await tx.$executeRaw`
          INSERT INTO "StockBalance" ("materialId", "warehouseId", "quantity", "updatedAt")
          VALUES (${l.materialId}, ${input.warehouseId}, 0, NOW())
          ON CONFLICT ("materialId", "warehouseId") DO NOTHING`;
        const rows = await tx.$queryRaw<{ quantity: Prisma.Decimal }[]>`
          SELECT "quantity" FROM "StockBalance"
          WHERE "materialId" = ${l.materialId} AND "warehouseId" = ${input.warehouseId}
          FOR UPDATE`;
        book.set(l.materialId, new D(rows[0].quantity));
      }

      const lines = input.lines.map((l) => {
        const m = byId.get(l.materialId)!;
        const counted = new D(l.countedQty).toDecimalPlaces(3);
        const bookQty = book.get(l.materialId)!;
        const diff = counted.minus(bookQty);
        return {
          materialId: m.id,
          unitId: m.baseUnitId,
          factor: new D(1),
          quantity: diff,
          baseQuantity: diff,
          unitPrice: m.purchasePrice,
          amount: diff.mul(m.purchasePrice).toDecimalPlaces(0),
          bookQty,
          countedQty: counted,
        };
      });

      const doc = await tx.stockDocument.create({
        data: {
          code: await nextDocNumber(tx, 'KK'),
          type: 'ADJUSTMENT',
          warehouseId: input.warehouseId,
          note: input.note ?? 'Kiểm kê kho',
          totalAmount: lines.reduce((s, l) => s.plus(l.amount), new D(0)), // giá trị chênh lệch (âm = hao hụt)
          createdById: userId,
          lines: { create: lines },
        },
      });
      await postStockDocumentTx(tx, doc.id, userId);
      return tx.stockDocument.findUniqueOrThrow({ where: { id: doc.id }, include: { lines: true } });
    },
    { timeout: 30_000 },
  );
}

// ───────────────────────── Tồn kho ─────────────────────────

export const overviewQuery = z.object({
  q: z.string().trim().max(100).optional(),
  warehouseId: z.coerce.number().int().positive().optional(),
  groupId: z.coerce.number().int().positive().optional(),
  onlyInStock: z.enum(['true', 'false']).optional(),
  lowStock: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(30),
});
export type OverviewQuery = z.infer<typeof overviewQuery>;

/**
 * Bảng tồn kho: mỗi vật tư một dòng, số tồn tại một kho hoặc tổng các kho đang hoạt động,
 * kèm giá trị theo giá mua. Lọc/sắp xếp/phân trang làm trong SQL để chạy nhanh với danh mục lớn.
 */
export async function stockOverview(q: OverviewQuery) {
  const conds: Prisma.Sql[] = [Prisma.sql`m."isActive"`];
  if (q.q) {
    const like = `%${q.q}%`;
    conds.push(Prisma.sql`(m.code ILIKE ${like} OR m.name ILIKE ${like})`);
  }
  if (q.groupId) conds.push(Prisma.sql`m."groupId" = ${q.groupId}`);
  const where = Prisma.join(conds, ' AND ');
  const whFilter = q.warehouseId
    ? Prisma.sql`b."warehouseId" = ${q.warehouseId}`
    : Prisma.sql`b."warehouseId" IN (SELECT id FROM "Warehouse" WHERE "isActive")`;

  const having: Prisma.Sql[] = [];
  if (q.onlyInStock === 'true') having.push(Prisma.sql`COALESCE(SUM(b.quantity), 0) > 0`);
  if (q.lowStock === 'true') having.push(Prisma.sql`COALESCE(SUM(b.quantity), 0) < m."minStock"`);
  const havingSql = having.length ? Prisma.sql`HAVING ${Prisma.join(having, ' AND ')}` : Prisma.empty;

  const base = Prisma.sql`
    FROM "Material" m
    JOIN "Unit" u ON u.id = m."baseUnitId"
    JOIN "MaterialGroup" g ON g.id = m."groupId"
    LEFT JOIN "StockBalance" b ON b."materialId" = m.id AND ${whFilter}
    WHERE ${where}
    GROUP BY m.id, u.name, g.name
    ${havingSql}`;

  const [rows, totals] = await Promise.all([
    prisma.$queryRaw<
      { id: number; code: string; name: string; specification: string | null; unitName: string; groupName: string;
        minStock: Prisma.Decimal; purchasePrice: Prisma.Decimal; quantity: Prisma.Decimal }[]
    >`
      SELECT m.id, m.code, m.name, m.specification, u.name AS "unitName", g.name AS "groupName",
             m."minStock", m."purchasePrice", COALESCE(SUM(b.quantity), 0) AS quantity
      ${base}
      ORDER BY m.code
      LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    prisma.$queryRaw<{ total: bigint; value: Prisma.Decimal | null }[]>`
      SELECT COUNT(*) AS total, SUM(t.quantity * t."purchasePrice") AS value FROM (
        SELECT m.id, m."purchasePrice", COALESCE(SUM(b.quantity), 0) AS quantity ${base}
      ) t`,
  ]);

  return {
    items: rows.map((r) => ({
      ...r,
      quantity: r.quantity.toString(),
      minStock: r.minStock.toString(),
      purchasePrice: r.purchasePrice.toString(),
      value: new D(r.quantity).mul(r.purchasePrice).toDecimalPlaces(0).toString(),
    })),
    total: Number(totals[0].total),
    totalValue: (totals[0].value ?? new D(0)).toDecimalPlaces(0).toString(),
    page: q.page,
    pageSize: q.pageSize,
  };
}

// ───────────────────────── Thẻ kho ─────────────────────────

export const stockCardQuery = z.object({
  materialId: z.coerce.number().int().positive(),
  warehouseId: z.coerce.number().int().positive(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/**
 * Thẻ kho của một vật tư tại một kho: tồn đầu kỳ, từng lần nhập/xuất trong kỳ (kèm chứng từ,
 * đối tác, tồn sau phát sinh), tổng nhập, tổng xuất, tồn cuối kỳ.
 */
export async function stockCard(q: z.infer<typeof stockCardQuery>) {
  const material = await prisma.material.findUnique({ where: { id: q.materialId }, include: { baseUnit: true } });
  const warehouse = await prisma.warehouse.findUnique({ where: { id: q.warehouseId } });
  if (!material || !warehouse) throw badRequest('Vật tư hoặc kho không tồn tại');

  const to = q.to ? new Date(new Date(q.to).setHours(23, 59, 59, 999)) : undefined;
  const scope = { materialId: q.materialId, warehouseId: q.warehouseId };
  const [opening, entries] = await Promise.all([
    q.from
      ? prisma.stockLedger.aggregate({ _sum: { quantity: true }, where: { ...scope, createdAt: { lt: q.from } } })
      : Promise.resolve({ _sum: { quantity: new D(0) } }),
    prisma.stockLedger.findMany({
      where: { ...scope, createdAt: { ...(q.from && { gte: q.from }), ...(to && { lte: to }) } },
      orderBy: { id: 'asc' },
      take: 2000,
      include: {
        document: {
          select: {
            id: true, code: true, type: true, docDate: true, note: true,
            supplier: { select: { name: true } },
            customer: { select: { name: true } },
            warehouse: { select: { name: true } },
            toWarehouse: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const openingQty = opening._sum.quantity ?? new D(0);
  let totalIn = new D(0);
  let totalOut = new D(0);
  const rows = entries.map((e) => {
    if (e.quantity.isPositive()) totalIn = totalIn.plus(e.quantity);
    else totalOut = totalOut.plus(e.quantity.neg());
    const d = e.document;
    // Diễn giải: với phiếu chuyển, đối tác là kho bên kia.
    const partner =
      d.type === 'TRANSFER'
        ? e.quantity.isNegative()
          ? `→ ${d.toWarehouse?.name ?? ''}`
          : `← ${d.warehouse.name}`
        : (d.supplier?.name ?? d.customer?.name ?? d.note ?? '');
    return {
      id: e.id.toString(),
      createdAt: e.createdAt,
      document: { id: d.id, code: d.code, type: d.type },
      partner,
      in: e.quantity.isPositive() ? e.quantity.toString() : '0',
      out: e.quantity.isNegative() ? e.quantity.neg().toString() : '0',
      balance: e.balanceAfter.toString(),
    };
  });

  return {
    material: { id: material.id, code: material.code, name: material.name, unit: material.baseUnit.name },
    warehouse: { id: warehouse.id, name: warehouse.name },
    opening: openingQty.toString(),
    totalIn: totalIn.toString(),
    totalOut: totalOut.toString(),
    closing: openingQty.plus(totalIn).minus(totalOut).toString(),
    rows,
  };
}
