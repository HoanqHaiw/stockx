import { Prisma, type PurchaseOrderStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma, type Tx } from '../../lib/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { nextDocNumber } from '../../lib/docNumber.js';
import { orderLineSchema, resolveLines, sumAmount } from '../../lib/lines.js';
import { optionalText } from '../../lib/query.js';
import { postStockDocumentTx } from '../stock/stock.service.js';

const D = Prisma.Decimal;

export const purchaseOrderSchema = z.object({
  supplierId: z.coerce.number().int().positive('Vui lòng chọn nhà cung cấp'),
  warehouseId: z.coerce.number().int().positive('Vui lòng chọn kho nhận'),
  expectedDate: z.coerce.date().optional().nullable(),
  note: optionalText(500),
  lines: z.array(orderLineSchema).min(1, 'Đơn hàng cần ít nhất một dòng vật tư').max(200),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

export const receiptSchema = z.object({
  docDate: z.coerce.date().optional(),
  note: optionalText(500),
  lines: z
    .array(
      z.object({
        purchaseOrderLineId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().min(0, 'Số lượng không được âm').max(1e9), // theo đơn vị trên PO
      }),
    )
    .min(1),
});
export type ReceiptInput = z.infer<typeof receiptSchema>;

export const poInclude = {
  supplier: true,
  warehouse: true,
  createdBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  lines: {
    orderBy: { id: 'asc' },
    include: { material: { include: { baseUnit: true, conversions: { include: { unit: true } } } } },
  },
  stockDocuments: {
    orderBy: { id: 'desc' },
    select: { id: true, code: true, docDate: true, status: true, totalAmount: true, createdBy: { select: { fullName: true } } },
  },
} satisfies Prisma.PurchaseOrderInclude;

async function assertHeaderRefs(tx: Tx, input: PurchaseOrderInput) {
  const [supplier, warehouse] = await Promise.all([
    tx.supplier.findUnique({ where: { id: input.supplierId } }),
    tx.warehouse.findUnique({ where: { id: input.warehouseId } }),
  ]);
  if (!supplier?.isActive) throw badRequest('Nhà cung cấp không tồn tại hoặc đã ngừng giao dịch');
  if (!warehouse?.isActive) throw badRequest('Kho nhận không tồn tại hoặc đã ngừng sử dụng');
}

/** Khoá dòng đơn mua để mọi thao tác đổi trạng thái / nhập kho trên cùng đơn chạy tuần tự. */
async function lockPo(tx: Tx, id: number) {
  const rows = await tx.$queryRaw<{ status: PurchaseOrderStatus }[]>`
    SELECT "status" FROM "PurchaseOrder" WHERE "id" = ${id} FOR UPDATE`;
  if (rows.length === 0) throw notFound('Không tìm thấy đơn mua hàng');
  return rows[0].status;
}

export function createPurchaseOrder(input: PurchaseOrderInput, userId: number) {
  return prisma.$transaction(async (tx) => {
    await assertHeaderRefs(tx, input);
    const lines = await resolveLines(tx, input.lines);
    return tx.purchaseOrder.create({
      data: {
        code: await nextDocNumber(tx, 'PO'),
        supplierId: input.supplierId,
        warehouseId: input.warehouseId,
        expectedDate: input.expectedDate ?? null,
        note: input.note,
        totalAmount: sumAmount(lines),
        createdById: userId,
        lines: { create: lines },
      },
      include: poInclude,
    });
  });
}

export function updatePurchaseOrder(id: number, input: PurchaseOrderInput) {
  return prisma.$transaction(async (tx) => {
    if ((await lockPo(tx, id)) !== 'DRAFT') throw conflict('Chỉ sửa được đơn ở trạng thái nháp');
    await assertHeaderRefs(tx, input);
    const lines = await resolveLines(tx, input.lines);
    await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
    return tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: input.supplierId,
        warehouseId: input.warehouseId,
        expectedDate: input.expectedDate ?? null,
        note: input.note,
        totalAmount: sumAmount(lines),
        lines: { create: lines },
      },
      include: poInclude,
    });
  });
}

export function approvePurchaseOrder(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    if ((await lockPo(tx, id)) !== 'DRAFT') throw conflict('Chỉ duyệt được đơn ở trạng thái nháp');
    return tx.purchaseOrder.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() },
      include: poInclude,
    });
  });
}

export function cancelPurchaseOrder(id: number) {
  return prisma.$transaction(async (tx) => {
    const status = await lockPo(tx, id);
    if (status !== 'DRAFT' && status !== 'APPROVED') {
      throw conflict('Đơn đã nhận hàng hoặc đã kết thúc nên không huỷ được');
    }
    return tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' }, include: poInclude });
  });
}

/**
 * Nhập kho theo đơn mua: tạo phiếu nhập, ghi sổ kho, cập nhật số đã nhận trên từng dòng,
 * chuyển trạng thái đơn và ghi công nợ phải trả, tất cả trong một transaction.
 * Đơn được khoá trong suốt quá trình nên hai thủ kho nhập cùng lúc không thể nhận vượt số đặt.
 */
export function receivePurchaseOrder(id: number, input: ReceiptInput, userId: number) {
  return prisma.$transaction(
    async (tx) => {
      const status = await lockPo(tx, id);
      if (status !== 'APPROVED' && status !== 'PARTIALLY_RECEIVED') {
        throw conflict('Chỉ nhập kho được với đơn đã duyệt và chưa nhận đủ');
      }
      const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true, warehouse: true } });
      if (!po.warehouse.isActive) throw conflict('Kho nhận của đơn đã ngừng sử dụng');
      const lineById = new Map(po.lines.map((l) => [l.id, l]));

      const receiptLines: (Prisma.StockDocumentLineUncheckedCreateWithoutDocumentInput & { amount: Prisma.Decimal })[] =
        [];
      const received = new Map<number, Prisma.Decimal>();
      for (const r of input.lines) {
        if (r.quantity === 0) continue;
        const line = lineById.get(r.purchaseOrderLineId);
        if (!line) throw badRequest('Dòng hàng không thuộc đơn mua này');
        if (received.has(line.id)) throw badRequest('Một dòng hàng chỉ được nhập một lần trong mỗi phiếu');

        const remaining = line.baseQuantity.minus(line.receivedBaseQty);
        const quantity = new D(r.quantity);
        let base = quantity.mul(line.factor).toDecimalPlaces(3);
        // Sai số làm tròn khi quy đổi (VD 1 cây = 7,22 kg): nhận "đủ phần còn lại" thì lấy đúng phần còn lại.
        if (base.greaterThan(remaining) && base.minus(remaining).lessThanOrEqualTo(0.001)) base = remaining;
        if (base.greaterThan(remaining)) {
          const remainingInUnit = remaining.div(line.factor).toDecimalPlaces(3);
          throw conflict(`Số lượng nhận vượt số còn lại của đơn (còn ${remainingInUnit.toString()})`, {
            purchaseOrderLineId: line.id,
          });
        }
        received.set(line.id, base);
        receiptLines.push({
          materialId: line.materialId,
          unitId: line.unitId,
          factor: line.factor,
          quantity,
          baseQuantity: base,
          unitPrice: line.unitPrice,
          amount: quantity.mul(line.unitPrice).toDecimalPlaces(0),
          purchaseOrderLineId: line.id,
        });
      }
      if (receiptLines.length === 0) throw badRequest('Vui lòng nhập số lượng thực nhận cho ít nhất một dòng');

      const totalAmount = sumAmount(receiptLines);
      const doc = await tx.stockDocument.create({
        data: {
          code: await nextDocNumber(tx, 'PN'),
          type: 'RECEIPT',
          warehouseId: po.warehouseId,
          purchaseOrderId: po.id,
          supplierId: po.supplierId,
          docDate: input.docDate ?? new Date(),
          note: input.note,
          totalAmount,
          createdById: userId,
          lines: { create: receiptLines },
        },
      });
      await postStockDocumentTx(tx, doc.id, userId);

      for (const [lineId, base] of received) {
        await tx.purchaseOrderLine.update({
          where: { id: lineId },
          data: { receivedBaseQty: { increment: base } },
        });
      }
      const after = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
      const done = after.every((l) => l.receivedBaseQty.greaterThanOrEqualTo(l.baseQuantity));
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: done ? 'RECEIVED' : 'PARTIALLY_RECEIVED' },
      });

      // Nhận hàng là phát sinh nợ phải trả nhà cung cấp theo giá trên đơn.
      await tx.debtEntry.create({
        data: { partnerType: 'SUPPLIER', supplierId: po.supplierId, documentId: doc.id, amount: totalAmount },
      });

      return tx.stockDocument.findUniqueOrThrow({
        where: { id: doc.id },
        include: { lines: true, purchaseOrder: { select: { id: true, code: true, status: true } } },
      });
    },
    { timeout: 20_000 },
  );
}
