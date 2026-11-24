import { Prisma, type QuotationStatus, type SalesOrderStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma, type Tx } from '../../lib/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { nextDocNumber } from '../../lib/docNumber.js';
import { orderLineSchema, resolveLines, sumAmount } from '../../lib/lines.js';
import { optionalText } from '../../lib/query.js';
import { postStockDocumentTx } from '../stock/stock.service.js';

const D = Prisma.Decimal;

// ───────────────────────── Schema ─────────────────────────

export const quotationSchema = z.object({
  customerId: z.coerce.number().int().positive('Vui lòng chọn khách hàng'),
  validUntil: z.coerce.date().optional().nullable(),
  note: optionalText(500),
  lines: z.array(orderLineSchema).min(1, 'Báo giá cần ít nhất một dòng vật tư').max(200),
});
export type QuotationInput = z.infer<typeof quotationSchema>;

export const salesOrderSchema = z.object({
  customerId: z.coerce.number().int().positive('Vui lòng chọn khách hàng'),
  warehouseId: z.coerce.number().int().positive('Vui lòng chọn kho xuất'),
  deliveryDate: z.coerce.date().optional().nullable(),
  note: optionalText(500),
  lines: z.array(orderLineSchema).min(1, 'Đơn hàng cần ít nhất một dòng vật tư').max(200),
});
export type SalesOrderInput = z.infer<typeof salesOrderSchema>;

export const convertSchema = z.object({
  warehouseId: z.coerce.number().int().positive('Vui lòng chọn kho xuất'),
  deliveryDate: z.coerce.date().optional().nullable(),
});

export const deliverySchema = z.object({
  docDate: z.coerce.date().optional(),
  note: optionalText(500),
  lines: z
    .array(
      z.object({
        salesOrderLineId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().min(0, 'Số lượng không được âm').max(1e9), // theo đơn vị trên đơn bán
      }),
    )
    .min(1),
});
export type DeliveryInput = z.infer<typeof deliverySchema>;

const lineMaterialInclude = {
  material: { include: { baseUnit: true, conversions: { include: { unit: true } } } },
} satisfies Prisma.QuotationLineInclude;

export const quotationInclude = {
  customer: true,
  createdBy: { select: { id: true, fullName: true } },
  lines: { orderBy: { id: 'asc' }, include: lineMaterialInclude },
  salesOrders: { select: { id: true, code: true, status: true } },
} satisfies Prisma.QuotationInclude;

export const salesOrderInclude = {
  customer: true,
  warehouse: true,
  quotation: { select: { id: true, code: true } },
  createdBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
  lines: { orderBy: { id: 'asc' }, include: lineMaterialInclude },
  stockDocuments: {
    orderBy: { id: 'desc' },
    select: { id: true, code: true, docDate: true, status: true, totalAmount: true, createdBy: { select: { fullName: true } } },
  },
} satisfies Prisma.SalesOrderInclude;

// ───────────────────────── Khoá & kiểm tra ─────────────────────────

async function lockQuotation(tx: Tx, id: number) {
  const rows = await tx.$queryRaw<{ status: QuotationStatus; validUntil: Date | null }[]>`
    SELECT "status", "validUntil" FROM "Quotation" WHERE "id" = ${id} FOR UPDATE`;
  if (rows.length === 0) throw notFound('Không tìm thấy báo giá');
  return rows[0];
}

async function lockSalesOrder(tx: Tx, id: number) {
  const rows = await tx.$queryRaw<{ status: SalesOrderStatus }[]>`
    SELECT "status" FROM "SalesOrder" WHERE "id" = ${id} FOR UPDATE`;
  if (rows.length === 0) throw notFound('Không tìm thấy đơn bán hàng');
  return rows[0].status;
}

async function assertCustomer(tx: Tx, customerId: number) {
  const c = await tx.customer.findUnique({ where: { id: customerId } });
  if (!c?.isActive) throw badRequest('Khách hàng không tồn tại hoặc đã ngừng giao dịch');
}
async function assertWarehouse(tx: Tx, warehouseId: number) {
  const w = await tx.warehouse.findUnique({ where: { id: warehouseId } });
  if (!w?.isActive) throw badRequest('Kho xuất không tồn tại hoặc đã ngừng sử dụng');
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// ───────────────────────── Báo giá ─────────────────────────

export function createQuotation(input: QuotationInput, userId: number) {
  return prisma.$transaction(async (tx) => {
    await assertCustomer(tx, input.customerId);
    const lines = await resolveLines(tx, input.lines);
    return tx.quotation.create({
      data: {
        code: await nextDocNumber(tx, 'BG'),
        customerId: input.customerId,
        validUntil: input.validUntil ?? null,
        note: input.note,
        totalAmount: sumAmount(lines),
        createdById: userId,
        lines: { create: lines },
      },
      include: quotationInclude,
    });
  });
}

export function updateQuotation(id: number, input: QuotationInput) {
  return prisma.$transaction(async (tx) => {
    const { status } = await lockQuotation(tx, id);
    if (status !== 'DRAFT') throw conflict('Chỉ sửa được báo giá ở trạng thái nháp');
    await assertCustomer(tx, input.customerId);
    const lines = await resolveLines(tx, input.lines);
    await tx.quotationLine.deleteMany({ where: { quotationId: id } });
    return tx.quotation.update({
      where: { id },
      data: {
        customerId: input.customerId,
        validUntil: input.validUntil ?? null,
        note: input.note,
        totalAmount: sumAmount(lines),
        lines: { create: lines },
      },
      include: quotationInclude,
    });
  });
}

/** Đổi trạng thái báo giá theo các bước hợp lệ. */
export function setQuotationStatus(id: number, next: 'SENT' | 'REJECTED') {
  const allowed: Record<typeof next, QuotationStatus[]> = { SENT: ['DRAFT'], REJECTED: ['DRAFT', 'SENT'] };
  return prisma.$transaction(async (tx) => {
    const { status } = await lockQuotation(tx, id);
    if (!allowed[next].includes(status)) throw conflict('Không thể chuyển báo giá sang trạng thái này');
    return tx.quotation.update({ where: { id }, data: { status: next }, include: quotationInclude });
  });
}

/**
 * Khách đồng ý báo giá → tạo đơn bán nháp với đúng các dòng và giá đã báo.
 * Báo giá chuyển sang ACCEPTED nên không thể tạo đơn lần thứ hai.
 */
export function convertQuotation(id: number, input: z.infer<typeof convertSchema>, userId: number) {
  return prisma.$transaction(async (tx) => {
    const q = await lockQuotation(tx, id);
    if (q.status !== 'DRAFT' && q.status !== 'SENT') throw conflict('Báo giá đã được chốt hoặc đã bị từ chối');
    if (q.validUntil && q.validUntil < startOfToday()) throw conflict('Báo giá đã hết hạn, hãy lập báo giá mới');
    await assertWarehouse(tx, input.warehouseId);
    const quotation = await tx.quotation.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    await assertCustomer(tx, quotation.customerId);

    const so = await tx.salesOrder.create({
      data: {
        code: await nextDocNumber(tx, 'DB'),
        customerId: quotation.customerId,
        warehouseId: input.warehouseId,
        quotationId: quotation.id,
        deliveryDate: input.deliveryDate ?? null,
        note: quotation.note,
        totalAmount: quotation.totalAmount,
        createdById: userId,
        lines: {
          create: quotation.lines.map((l) => ({
            materialId: l.materialId,
            unitId: l.unitId,
            factor: l.factor,
            quantity: l.quantity,
            baseQuantity: l.baseQuantity,
            unitPrice: l.unitPrice,
            amount: l.amount,
          })),
        },
      },
      include: salesOrderInclude,
    });
    await tx.quotation.update({ where: { id }, data: { status: 'ACCEPTED' } });
    return so;
  });
}

// ───────────────────────── Đơn bán ─────────────────────────

export function createSalesOrder(input: SalesOrderInput, userId: number) {
  return prisma.$transaction(async (tx) => {
    await Promise.all([assertCustomer(tx, input.customerId), assertWarehouse(tx, input.warehouseId)]);
    const lines = await resolveLines(tx, input.lines);
    return tx.salesOrder.create({
      data: {
        code: await nextDocNumber(tx, 'DB'),
        customerId: input.customerId,
        warehouseId: input.warehouseId,
        deliveryDate: input.deliveryDate ?? null,
        note: input.note,
        totalAmount: sumAmount(lines),
        createdById: userId,
        lines: { create: lines },
      },
      include: salesOrderInclude,
    });
  });
}

export function updateSalesOrder(id: number, input: SalesOrderInput) {
  return prisma.$transaction(async (tx) => {
    if ((await lockSalesOrder(tx, id)) !== 'DRAFT') throw conflict('Chỉ sửa được đơn ở trạng thái nháp');
    await Promise.all([assertCustomer(tx, input.customerId), assertWarehouse(tx, input.warehouseId)]);
    const lines = await resolveLines(tx, input.lines);
    await tx.salesOrderLine.deleteMany({ where: { salesOrderId: id } });
    return tx.salesOrder.update({
      where: { id },
      data: {
        customerId: input.customerId,
        warehouseId: input.warehouseId,
        deliveryDate: input.deliveryDate ?? null,
        note: input.note,
        totalAmount: sumAmount(lines),
        lines: { create: lines },
      },
      include: salesOrderInclude,
    });
  });
}

export function approveSalesOrder(id: number, userId: number) {
  return prisma.$transaction(async (tx) => {
    if ((await lockSalesOrder(tx, id)) !== 'DRAFT') throw conflict('Chỉ duyệt được đơn ở trạng thái nháp');
    return tx.salesOrder.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() },
      include: salesOrderInclude,
    });
  });
}

export function cancelSalesOrder(id: number) {
  return prisma.$transaction(async (tx) => {
    const status = await lockSalesOrder(tx, id);
    if (status !== 'DRAFT' && status !== 'APPROVED') throw conflict('Đơn đã giao hàng hoặc đã kết thúc nên không huỷ được');
    return tx.salesOrder.update({ where: { id }, data: { status: 'CANCELLED' }, include: salesOrderInclude });
  });
}

/**
 * Xuất kho giao hàng theo đơn bán. Một transaction:
 * tạo phiếu xuất → ghi sổ kho (chặn âm kho) → cộng số đã giao → đổi trạng thái đơn → ghi công nợ phải thu.
 * Thiếu hàng ở bất kỳ dòng nào thì toàn bộ phiếu bị từ chối, kèm danh sách vật tư thiếu.
 */
export function deliverSalesOrder(id: number, input: DeliveryInput, userId: number) {
  return prisma.$transaction(
    async (tx) => {
      const status = await lockSalesOrder(tx, id);
      if (status !== 'APPROVED' && status !== 'PARTIALLY_DELIVERED') {
        throw conflict('Chỉ xuất kho được với đơn đã duyệt và chưa giao đủ');
      }
      const so = await tx.salesOrder.findUniqueOrThrow({ where: { id }, include: { lines: true, warehouse: true } });
      if (!so.warehouse.isActive) throw conflict('Kho xuất của đơn đã ngừng sử dụng');
      const lineById = new Map(so.lines.map((l) => [l.id, l]));

      const issueLines: (Prisma.StockDocumentLineUncheckedCreateWithoutDocumentInput & { amount: Prisma.Decimal })[] = [];
      const delivered = new Map<number, Prisma.Decimal>();
      for (const r of input.lines) {
        if (r.quantity === 0) continue;
        const line = lineById.get(r.salesOrderLineId);
        if (!line) throw badRequest('Dòng hàng không thuộc đơn bán này');
        if (delivered.has(line.id)) throw badRequest('Một dòng hàng chỉ được xuất một lần trong mỗi phiếu');

        const remaining = line.baseQuantity.minus(line.deliveredBaseQty);
        const quantity = new D(r.quantity);
        let base = quantity.mul(line.factor).toDecimalPlaces(3);
        if (base.greaterThan(remaining) && base.minus(remaining).lessThanOrEqualTo(0.001)) base = remaining;
        if (base.greaterThan(remaining)) {
          const left = remaining.div(line.factor).toDecimalPlaces(3);
          throw conflict(`Số lượng giao vượt số còn lại của đơn (còn ${left.toString()})`, { salesOrderLineId: line.id });
        }
        delivered.set(line.id, base);
        issueLines.push({
          materialId: line.materialId,
          unitId: line.unitId,
          factor: line.factor,
          quantity,
          baseQuantity: base,
          unitPrice: line.unitPrice,
          amount: quantity.mul(line.unitPrice).toDecimalPlaces(0),
          salesOrderLineId: line.id,
        });
      }
      if (issueLines.length === 0) throw badRequest('Vui lòng nhập số lượng giao cho ít nhất một dòng');

      const totalAmount = sumAmount(issueLines);
      const doc = await tx.stockDocument.create({
        data: {
          code: await nextDocNumber(tx, 'PX'),
          type: 'ISSUE',
          warehouseId: so.warehouseId,
          salesOrderId: so.id,
          customerId: so.customerId,
          docDate: input.docDate ?? new Date(),
          note: input.note,
          totalAmount,
          createdById: userId,
          lines: { create: issueLines },
        },
      });
      await postStockDocumentTx(tx, doc.id, userId); // ném 409 kèm danh sách nếu thiếu hàng

      for (const [lineId, base] of delivered) {
        await tx.salesOrderLine.update({ where: { id: lineId }, data: { deliveredBaseQty: { increment: base } } });
      }
      const after = await tx.salesOrderLine.findMany({ where: { salesOrderId: so.id } });
      const done = after.every((l) => l.deliveredBaseQty.greaterThanOrEqualTo(l.baseQuantity));
      await tx.salesOrder.update({ where: { id: so.id }, data: { status: done ? 'DELIVERED' : 'PARTIALLY_DELIVERED' } });

      // Giao hàng là phát sinh nợ phải thu khách hàng theo giá trên đơn.
      await tx.debtEntry.create({
        data: { partnerType: 'CUSTOMER', customerId: so.customerId, documentId: doc.id, amount: totalAmount },
      });

      return tx.stockDocument.findUniqueOrThrow({
        where: { id: doc.id },
        include: { lines: true, salesOrder: { select: { id: true, code: true, status: true } } },
      });
    },
    { timeout: 20_000 },
  );
}
