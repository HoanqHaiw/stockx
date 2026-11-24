import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma, type Tx } from '../../lib/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { codeSchema, optionalText } from '../../lib/query.js';

const money = z.coerce.number().min(0, 'Không được âm').max(1e13);
const qty = z.coerce.number().min(0, 'Không được âm').max(1e12);

export const materialSchema = z
  .object({
    code: codeSchema,
    name: z.string().trim().min(1, 'Vui lòng nhập tên vật tư').max(200),
    specification: optionalText(300),
    groupId: z.coerce.number().int().positive('Vui lòng chọn nhóm'),
    baseUnitId: z.coerce.number().int().positive('Vui lòng chọn đơn vị tính'),
    purchasePrice: money.default(0),
    salePrice: money.default(0),
    minStock: qty.default(0),
    conversions: z
      .array(
        z.object({
          unitId: z.coerce.number().int().positive(),
          factor: z.coerce.number().positive('Hệ số quy đổi phải lớn hơn 0').max(1e6),
        }),
      )
      .max(10)
      .default([]),
  })
  .superRefine((m, ctx) => {
    const seen = new Set<number>();
    m.conversions.forEach((c, i) => {
      if (c.unitId === m.baseUnitId) {
        ctx.addIssue({ code: 'custom', path: ['conversions', i, 'unitId'], message: 'Trùng với đơn vị cơ sở' });
      }
      if (seen.has(c.unitId)) {
        ctx.addIssue({ code: 'custom', path: ['conversions', i, 'unitId'], message: 'Đơn vị quy đổi bị lặp' });
      }
      seen.add(c.unitId);
    });
  });
export type MaterialInput = z.infer<typeof materialSchema>;

export const materialInclude = {
  group: true,
  baseUnit: true,
  conversions: { include: { unit: true }, orderBy: { factor: 'asc' } },
} satisfies Prisma.MaterialInclude;

/** Kiểm tra nhóm và đơn vị tính tồn tại để trả lỗi rõ ràng thay vì lỗi khoá ngoại. */
async function assertRefs(tx: Tx, input: MaterialInput) {
  const unitIds = [input.baseUnitId, ...input.conversions.map((c) => c.unitId)];
  const [group, units] = await Promise.all([
    tx.materialGroup.findUnique({ where: { id: input.groupId } }),
    tx.unit.findMany({ where: { id: { in: unitIds } }, select: { id: true } }),
  ]);
  if (!group) throw badRequest('Nhóm vật tư không tồn tại');
  if (units.length !== new Set(unitIds).size) throw badRequest('Đơn vị tính không tồn tại');
}

function toData(input: MaterialInput) {
  const { conversions: _c, ...rest } = input;
  return {
    ...rest,
    purchasePrice: new Prisma.Decimal(input.purchasePrice),
    salePrice: new Prisma.Decimal(input.salePrice),
    minStock: new Prisma.Decimal(input.minStock),
  };
}

export async function createMaterialTx(tx: Tx, input: MaterialInput) {
  await assertRefs(tx, input);
  return tx.material.create({
    data: {
      ...toData(input),
      conversions: { create: input.conversions.map((c) => ({ unitId: c.unitId, factor: new Prisma.Decimal(c.factor) })) },
    },
    include: materialInclude,
  });
}

/**
 * Cập nhật vật tư. Quy tắc nghiệp vụ:
 * - Đã có phát sinh kho thì không được đổi đơn vị cơ sở (sổ kho đang tính theo đơn vị đó).
 * - Quy đổi được thay toàn bộ; chứng từ cũ không bị ảnh hưởng vì đã lưu hệ số tại thời điểm lập.
 */
export async function updateMaterialTx(tx: Tx, id: number, input: MaterialInput) {
  const current = await tx.material.findUnique({ where: { id } });
  if (!current) throw notFound('Không tìm thấy vật tư');
  await assertRefs(tx, input);
  if (current.baseUnitId !== input.baseUnitId) {
    const used = await tx.stockLedger.count({ where: { materialId: id } });
    if (used > 0) throw conflict('Vật tư đã có phát sinh kho nên không được đổi đơn vị tính cơ sở');
  }
  await tx.unitConversion.deleteMany({ where: { materialId: id } });
  return tx.material.update({
    where: { id },
    data: {
      ...toData(input),
      conversions: { create: input.conversions.map((c) => ({ unitId: c.unitId, factor: new Prisma.Decimal(c.factor) })) },
    },
    include: materialInclude,
  });
}

export const createMaterial = (input: MaterialInput) => prisma.$transaction((tx) => createMaterialTx(tx, input));
export const updateMaterial = (id: number, input: MaterialInput) =>
  prisma.$transaction((tx) => updateMaterialTx(tx, id, input));

/** Tổng tồn theo vật tư (mọi kho đang hoạt động). */
export async function totalStockOf(materialIds: number[]) {
  if (materialIds.length === 0) return new Map<number, string>();
  const rows = await prisma.stockBalance.groupBy({
    by: ['materialId'],
    where: { materialId: { in: materialIds }, warehouse: { isActive: true } },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.materialId, (r._sum.quantity ?? new Prisma.Decimal(0)).toString()]));
}

/** Id các vật tư có tổng tồn dưới mức tối thiểu. */
export async function lowStockIds(): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT m.id FROM "Material" m
    LEFT JOIN "StockBalance" b ON b."materialId" = m.id
    LEFT JOIN "Warehouse" w ON w.id = b."warehouseId" AND w."isActive"
    WHERE m."isActive" AND m."minStock" > 0
    GROUP BY m.id, m."minStock"
    HAVING COALESCE(SUM(CASE WHEN w.id IS NOT NULL THEN b.quantity END), 0) < m."minStock"`;
  return rows.map((r) => r.id);
}
