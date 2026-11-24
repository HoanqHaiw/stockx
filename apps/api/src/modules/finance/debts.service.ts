import { Prisma, type PartnerType, type PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import { prisma, type Tx } from '../../lib/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { nextDocNumber } from '../../lib/docNumber.js';
import { optionalText } from '../../lib/query.js';

const D = Prisma.Decimal;

/** Hạn thanh toán mặc định (ngày) tính từ ngày phát sinh nợ. */
export const PAYMENT_TERM_DAYS = 30;
const DAY = 86_400_000;

export const partnerTypeSchema = z.enum(['CUSTOMER', 'SUPPLIER']);

// ───────────────────────── Phân tuổi nợ ─────────────────────────

export interface Aging {
  current: string; // chưa đến hạn
  overdue1to30: string;
  overdue31to60: string;
  overdueOver60: string;
}

interface Entry {
  amount: Prisma.Decimal;
  createdAt: Date;
}

/**
 * Phân tuổi nợ theo nguyên tắc FIFO: tiền thanh toán được trừ vào khoản nợ phát sinh sớm nhất trước.
 * Phần nợ còn lại của từng khoản được xếp vào nhóm theo số ngày quá hạn so với hạn thanh toán.
 */
export function ageDebt(entries: Entry[], now = new Date()): Aging {
  const sorted = [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let paid = sorted.filter((e) => e.amount.isNegative()).reduce((s, e) => s.plus(e.amount.neg()), new D(0));
  const buckets = { current: new D(0), overdue1to30: new D(0), overdue31to60: new D(0), overdueOver60: new D(0) };

  for (const e of sorted) {
    if (!e.amount.isPositive()) continue;
    const used = D.min(paid, e.amount);
    paid = paid.minus(used);
    const remaining = e.amount.minus(used);
    if (remaining.isZero()) continue;
    const overdueDays = Math.floor((now.getTime() - e.createdAt.getTime()) / DAY) - PAYMENT_TERM_DAYS;
    const key =
      overdueDays <= 0 ? 'current' : overdueDays <= 30 ? 'overdue1to30' : overdueDays <= 60 ? 'overdue31to60' : 'overdueOver60';
    buckets[key] = buckets[key].plus(remaining);
  }
  return {
    current: buckets.current.toString(),
    overdue1to30: buckets.overdue1to30.toString(),
    overdue31to60: buckets.overdue31to60.toString(),
    overdueOver60: buckets.overdueOver60.toString(),
  };
}

// ───────────────────────── Tổng hợp công nợ ─────────────────────────

const partnerCol = (type: PartnerType) => (type === 'CUSTOMER' ? 'customerId' : 'supplierId');

export interface DebtSummaryRow {
  partnerId: number;
  code: string;
  name: string;
  increase: string; // tổng phát sinh nợ
  decrease: string; // tổng đã thanh toán
  balance: string; // còn nợ
  aging: Aging;
}

/** Bảng tổng hợp công nợ phải thu (khách hàng) hoặc phải trả (nhà cung cấp). */
export async function debtSummary(type: PartnerType, q?: string) {
  const col = partnerCol(type);
  const partners =
    type === 'CUSTOMER'
      ? await prisma.customer.findMany({ select: { id: true, code: true, name: true } })
      : await prisma.supplier.findMany({ select: { id: true, code: true, name: true } });
  const needle = q?.trim().toLowerCase();
  const shown = partners.filter(
    (p) => !needle || p.code.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle),
  );

  const entries = await prisma.debtEntry.findMany({
    where: { partnerType: type, [col]: { in: shown.map((p) => p.id) } },
    select: { amount: true, createdAt: true, customerId: true, supplierId: true },
  });
  const byPartner = new Map<number, Entry[]>();
  for (const e of entries) {
    const id = (type === 'CUSTOMER' ? e.customerId : e.supplierId)!;
    byPartner.set(id, [...(byPartner.get(id) ?? []), e]);
  }

  const rows: DebtSummaryRow[] = shown
    .filter((p) => byPartner.has(p.id))
    .map((p) => {
      const list = byPartner.get(p.id)!;
      const increase = list.filter((e) => e.amount.isPositive()).reduce((s, e) => s.plus(e.amount), new D(0));
      const decrease = list.filter((e) => e.amount.isNegative()).reduce((s, e) => s.plus(e.amount.neg()), new D(0));
      return {
        partnerId: p.id,
        code: p.code,
        name: p.name,
        increase: increase.toString(),
        decrease: decrease.toString(),
        balance: increase.minus(decrease).toString(),
        aging: ageDebt(list),
      };
    })
    .sort((a, b) => Number(b.balance) - Number(a.balance));

  const sum = (pick: (r: DebtSummaryRow) => string) => rows.reduce((s, r) => s.plus(pick(r)), new D(0)).toString();
  return {
    rows,
    totals: {
      increase: sum((r) => r.increase),
      decrease: sum((r) => r.decrease),
      balance: sum((r) => r.balance),
      aging: {
        current: sum((r) => r.aging.current),
        overdue1to30: sum((r) => r.aging.overdue1to30),
        overdue31to60: sum((r) => r.aging.overdue31to60),
        overdueOver60: sum((r) => r.aging.overdueOver60),
      },
    },
    paymentTermDays: PAYMENT_TERM_DAYS,
  };
}

// ───────────────────────── Sổ chi tiết công nợ ─────────────────────────

export async function debtLedger(type: PartnerType, partnerId: number) {
  const col = partnerCol(type);
  const partner =
    type === 'CUSTOMER'
      ? await prisma.customer.findUnique({ where: { id: partnerId } })
      : await prisma.supplier.findUnique({ where: { id: partnerId } });
  if (!partner) throw notFound('Không tìm thấy đối tác');

  const entries = await prisma.debtEntry.findMany({
    where: { partnerType: type, [col]: partnerId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      document: { select: { id: true, code: true, type: true } },
      payment: { select: { id: true, code: true, method: true, note: true } },
    },
  });

  let running = new D(0);
  const rows = entries.map((e) => {
    running = running.plus(e.amount);
    return {
      id: e.id.toString(),
      date: e.createdAt,
      ref: e.document
        ? { kind: 'document' as const, id: e.document.id, code: e.document.code }
        : { kind: 'payment' as const, id: e.payment!.id, code: e.payment!.code },
      description: e.document
        ? type === 'CUSTOMER'
          ? 'Xuất hàng giao khách'
          : 'Nhập hàng từ nhà cung cấp'
        : `${type === 'CUSTOMER' ? 'Thu tiền' : 'Trả tiền'} ${e.payment!.method === 'CASH' ? 'tiền mặt' : 'chuyển khoản'}${
            e.payment!.note ? ` – ${e.payment!.note}` : ''
          }`,
      increase: e.amount.isPositive() ? e.amount.toString() : '0',
      decrease: e.amount.isNegative() ? e.amount.neg().toString() : '0',
      balance: running.toString(),
    };
  });

  return {
    partner: { id: partner.id, code: partner.code, name: partner.name, taxCode: partner.taxCode, phone: partner.phone },
    balance: running.toString(),
    aging: ageDebt(entries),
    rows: rows.reverse(), // mới nhất lên đầu
  };
}

// ───────────────────────── Thanh toán ─────────────────────────

export const paymentSchema = z.object({
  partnerType: partnerTypeSchema,
  partnerId: z.coerce.number().int().positive('Vui lòng chọn đối tác'),
  amount: z.coerce.number().positive('Số tiền phải lớn hơn 0').max(1e13),
  method: z.enum(['CASH', 'BANK_TRANSFER']).default('BANK_TRANSFER'),
  paymentDate: z.coerce.date().optional(),
  note: optionalText(300),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

/** Khoá dòng đối tác để các phiếu thu/chi của cùng một đối tác chạy tuần tự. */
async function lockPartner(tx: Tx, type: PartnerType, id: number) {
  const rows =
    type === 'CUSTOMER'
      ? await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Customer" WHERE id = ${id} FOR UPDATE`
      : await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Supplier" WHERE id = ${id} FOR UPDATE`;
  if (rows.length === 0) throw badRequest('Đối tác không tồn tại');
}

/**
 * Ghi nhận thu tiền khách hàng / trả tiền nhà cung cấp.
 * Không cho thu/trả vượt số đang nợ (chưa hỗ trợ trả trước); khoá đối tác để hai kế toán
 * cùng nhập một khoản không làm âm công nợ.
 */
export function createPayment(input: PaymentInput, userId: number) {
  return prisma.$transaction(async (tx) => {
    const { partnerType: type, partnerId } = input;
    await lockPartner(tx, type, partnerId);
    const col = partnerCol(type);
    const agg = await tx.debtEntry.aggregate({ _sum: { amount: true }, where: { partnerType: type, [col]: partnerId } });
    const balance = agg._sum.amount ?? new D(0);
    const amount = new D(input.amount).toDecimalPlaces(0);
    if (amount.greaterThan(balance)) {
      throw conflict(`Số tiền vượt công nợ hiện tại (${balance.toDecimalPlaces(0).toString()} đ)`, {
        balance: balance.toString(),
      });
    }
    const date = input.paymentDate ?? new Date();
    const partnerRef = type === 'CUSTOMER' ? { customerId: partnerId } : { supplierId: partnerId };
    const payment = await tx.payment.create({
      data: {
        code: await nextDocNumber(tx, type === 'CUSTOMER' ? 'PT' : 'PCH'),
        partnerType: type,
        ...partnerRef,
        amount,
        method: input.method as PaymentMethod,
        paymentDate: date,
        note: input.note,
        createdById: userId,
      },
    });
    await tx.debtEntry.create({
      data: { partnerType: type, ...partnerRef, paymentId: payment.id, amount: amount.neg(), createdAt: date },
    });
    return { ...payment, balanceAfter: balance.minus(amount).toString() };
  });
}
