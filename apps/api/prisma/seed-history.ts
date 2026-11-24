/**
 * Sinh lịch sử giao dịch ~90 ngày bằng chính các service nghiệp vụ (mua, nhập, bán, xuất, thu/chi),
 * sau đó lùi ngày chứng từ / sổ kho / sổ công nợ về đúng ngày giả lập.
 * Chạy tuần tự theo thời gian nên thứ tự id trong sổ kho khớp với thứ tự ngày.
 */
import type { PrismaClient } from '@prisma/client';
import { approvePurchaseOrder, createPurchaseOrder, receivePurchaseOrder } from '../src/modules/purchasing/purchasing.service.js';
import { approveSalesOrder, createSalesOrder, deliverSalesOrder } from '../src/modules/sales/sales.service.js';
import { createPayment } from '../src/modules/finance/debts.service.js';
import { AppError } from '../src/lib/errors.js';

const DAY = 86_400_000;

/** PRNG có hạt giống để lần seed nào cũng ra cùng dữ liệu. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedHistory(prisma: PrismaClient, days = 90) {
  const rand = mulberry32(20261124);
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const between = (a: number, b: number) => a + rand() * (b - a);

  const users = Object.fromEntries((await prisma.user.findMany()).map((u) => [u.role, u.id]));
  const materials = await prisma.material.findMany({ where: { isActive: true } });
  const suppliers = await prisma.supplier.findMany();
  const customers = await prisma.customer.findMany();
  const main = await prisma.warehouse.findUniqueOrThrow({ where: { code: 'KHO-TM' } });

  /** Lùi ngày cho chứng từ kho cùng sổ kho, sổ công nợ của nó. */
  async function backdateStockDoc(id: number, at: Date) {
    await prisma.stockDocument.update({ where: { id }, data: { docDate: at, createdAt: at, postedAt: at } });
    await prisma.stockLedger.updateMany({ where: { documentId: id }, data: { createdAt: at } });
    await prisma.debtEntry.updateMany({ where: { documentId: id }, data: { createdAt: at } });
  }

  const start = new Date(Date.now() - days * DAY);
  start.setHours(8, 0, 0, 0);

  // Tồn đầu kỳ coi như có từ ngày đầu tiên.
  for (const d of await prisma.stockDocument.findMany({ where: { note: 'Tồn đầu kỳ' } })) {
    await backdateStockDoc(d.id, new Date(start.getTime() - DAY));
  }

  let stats = { po: 0, receipts: 0, so: 0, deliveries: 0, payments: 0 };

  for (let i = 0; i < days; i++) {
    const day = new Date(start.getTime() + i * DAY);
    const at = (hour: number) => new Date(day.getTime() + (hour - 8) * 3600_000);

    // Nhập hàng: khoảng 2 lần mỗi tuần.
    if (rand() < 0.3) {
      const items = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(materials));
      const unique = [...new Map(items.map((m) => [m.id, m])).values()];
      const po = await createPurchaseOrder(
        {
          supplierId: pick(suppliers).id,
          warehouseId: main.id,
          note: null,
          expectedDate: null,
          lines: unique.map((m) => ({
            materialId: m.id,
            unitId: m.baseUnitId,
            quantity: Math.max(1, Math.round(Number(m.minStock) * between(0.6, 1.4))),
            unitPrice: Number(m.purchasePrice),
          })),
        },
        users.PURCHASING,
      );
      await approvePurchaseOrder(po.id, users.ADMIN);
      await prisma.purchaseOrder.update({ where: { id: po.id }, data: { orderDate: at(9), createdAt: at(9), approvedAt: at(10) } });
      const receipt = await receivePurchaseOrder(
        po.id,
        { note: null, lines: po.lines.map((l) => ({ purchaseOrderLineId: l.id, quantity: Number(l.quantity) })) },
        users.WAREHOUSE,
      );
      await backdateStockDoc(receipt.id, at(15));
      stats.po++;
      stats.receipts++;
    }

    // Bán hàng: hầu hết các ngày làm việc.
    const orders = day.getDay() === 0 ? 0 : Math.floor(between(0, 3));
    for (let k = 0; k < orders; k++) {
      const items = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(materials));
      const unique = [...new Map(items.map((m) => [m.id, m])).values()];
      const so = await createSalesOrder(
        {
          customerId: pick(customers).id,
          warehouseId: main.id,
          note: null,
          deliveryDate: null,
          lines: unique.map((m) => ({
            materialId: m.id,
            unitId: m.baseUnitId,
            quantity: Math.max(1, Math.round(Number(m.minStock) * between(0.08, 0.3))),
            unitPrice: Number(m.salePrice),
          })),
        },
        users.SALES,
      );
      await approveSalesOrder(so.id, users.ADMIN);
      await prisma.salesOrder.update({ where: { id: so.id }, data: { orderDate: at(9), createdAt: at(9), approvedAt: at(10) } });
      try {
        const issue = await deliverSalesOrder(
          so.id,
          { note: null, lines: so.lines.map((l) => ({ salesOrderLineId: l.id, quantity: Number(l.quantity) })) },
          users.WAREHOUSE,
        );
        await backdateStockDoc(issue.id, at(14 + k));
        stats.deliveries++;
      } catch (e) {
        if (!(e instanceof AppError && e.status === 409)) throw e; // thiếu hàng: đơn nằm chờ giao
      }
      stats.so++;
    }

    // Thu tiền khách / trả tiền nhà cung cấp: định kỳ, trả một phần để có nợ quá hạn.
    if (i % 5 === 4) {
      for (const [type, list] of [['CUSTOMER', customers], ['SUPPLIER', suppliers]] as const) {
        const partner = pick(list as { id: number }[]);
        const where = type === 'CUSTOMER' ? { customerId: partner.id } : { supplierId: partner.id };
        const bal = Number((await prisma.debtEntry.aggregate({ _sum: { amount: true }, where })).
          _sum.amount ?? 0);
        if (bal <= 0) continue;
        const amount = Math.round((bal * between(0.4, 0.9)) / 1000) * 1000;
        if (amount <= 0) continue;
        const p = await createPayment(
          { partnerType: type, partnerId: partner.id, amount, method: rand() < 0.8 ? 'BANK_TRANSFER' : 'CASH', paymentDate: at(11), note: null },
          users.ACCOUNTANT,
        );
        await prisma.payment.update({ where: { id: p.id }, data: { createdAt: at(11) } });
        stats.payments++;
      }
    }
  }

  // Vài chứng từ đang chờ xử lý hôm nay cho dashboard.
  const m1 = materials[3];
  const m2 = materials[8];
  await createPurchaseOrder(
    {
      supplierId: suppliers[1].id, warehouseId: main.id, note: 'Bổ sung hàng thiếu', expectedDate: new Date(Date.now() + 3 * DAY),
      lines: [{ materialId: m1.id, unitId: m1.baseUnitId, quantity: Number(m1.minStock), unitPrice: Number(m1.purchasePrice) }],
    },
    users.PURCHASING,
  );
  await createSalesOrder(
    {
      customerId: customers[0].id, warehouseId: main.id, note: 'Khách hỏi giao gấp', deliveryDate: new Date(Date.now() + DAY),
      lines: [{ materialId: m2.id, unitId: m2.baseUnitId, quantity: 20, unitPrice: Number(m2.salePrice) }],
    },
    users.SALES,
  );

  return stats;
}
