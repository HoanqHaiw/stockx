import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Tx } from './prisma.js';
import { badRequest } from './errors.js';

const D = Prisma.Decimal;

/** Dòng hàng người dùng nhập: số lượng và đơn giá tính theo đơn vị họ chọn. */
export const orderLineSchema = z.object({
  materialId: z.coerce.number().int().positive('Vui lòng chọn vật tư'),
  unitId: z.coerce.number().int().positive('Vui lòng chọn đơn vị'),
  quantity: z.coerce.number().positive('Số lượng phải lớn hơn 0').max(1e9),
  unitPrice: z.coerce.number().min(0, 'Đơn giá không được âm').max(1e13),
});
export type OrderLineInput = z.infer<typeof orderLineSchema>;

export interface ResolvedLine {
  materialId: number;
  unitId: number;
  factor: Prisma.Decimal;
  quantity: Prisma.Decimal;
  baseQuantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  amount: Prisma.Decimal;
}

/**
 * Chuẩn hoá dòng hàng: lấy hệ số quy đổi của đơn vị người dùng chọn,
 * tính số lượng theo đơn vị cơ sở và thành tiền. Hệ số được lưu cùng dòng
 * nên sau này đổi quy đổi trong danh mục cũng không làm sai chứng từ cũ.
 */
export async function resolveLines(tx: Tx, lines: OrderLineInput[]): Promise<ResolvedLine[]> {
  const materials = await tx.material.findMany({
    where: { id: { in: [...new Set(lines.map((l) => l.materialId))] } },
    include: { conversions: true },
  });
  const byId = new Map(materials.map((m) => [m.id, m]));

  return lines.map((l, i) => {
    const m = byId.get(l.materialId);
    if (!m) throw badRequest(`Dòng ${i + 1}: vật tư không tồn tại`);
    if (!m.isActive) throw badRequest(`Dòng ${i + 1}: vật tư ${m.code} đã ngừng sử dụng`);
    const factor =
      l.unitId === m.baseUnitId ? new D(1) : m.conversions.find((c) => c.unitId === l.unitId)?.factor;
    if (!factor) throw badRequest(`Dòng ${i + 1}: đơn vị tính không áp dụng cho vật tư ${m.code}`);
    const quantity = new D(l.quantity);
    const unitPrice = new D(l.unitPrice);
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
}

export const sumAmount = (lines: { amount: Prisma.Decimal }[]) =>
  lines.reduce((s, l) => s.plus(l.amount), new D(0));
