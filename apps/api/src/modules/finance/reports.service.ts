import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { lowStockIds } from '../materials/materials.service.js';
import { debtSummary } from './debts.service.js';

const D = Prisma.Decimal;
const TZ = 'Asia/Ho_Chi_Minh';

// ───────────────────────── Dashboard ─────────────────────────

/**
 * Số liệu tổng quan. Mốc "tháng này", "theo ngày" tính theo giờ Việt Nam (dữ liệu lưu UTC),
 * nếu không giao dịch lúc 0h–7h sáng sẽ bị tính nhầm sang ngày hôm trước.
 */
export async function dashboard() {
  const [kpi] = await prisma.$queryRaw<
    {
      revenueMonth: Prisma.Decimal | null;
      purchaseMonth: Prisma.Decimal | null;
      revenuePrevMonth: Prisma.Decimal | null;
      inventoryValue: Prisma.Decimal | null;
      receivable: Prisma.Decimal | null;
      payable: Prisma.Decimal | null;
    }[]
  >`
    WITH m AS (SELECT date_trunc('month', now() AT TIME ZONE ${TZ}) AS start)
    SELECT
      (SELECT SUM("totalAmount") FROM "StockDocument", m
        WHERE type = 'ISSUE' AND status = 'POSTED' AND ("docDate" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}) >= m.start) AS "revenueMonth",
      (SELECT SUM("totalAmount") FROM "StockDocument", m
        WHERE type = 'RECEIPT' AND status = 'POSTED' AND ("docDate" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}) >= m.start) AS "purchaseMonth",
      (SELECT SUM("totalAmount") FROM "StockDocument", m
        WHERE type = 'ISSUE' AND status = 'POSTED'
          AND ("docDate" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}) >= m.start - interval '1 month'
          AND ("docDate" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}) < m.start) AS "revenuePrevMonth",
      (SELECT SUM(b.quantity * mt."purchasePrice") FROM "StockBalance" b
        JOIN "Material" mt ON mt.id = b."materialId"
        JOIN "Warehouse" w ON w.id = b."warehouseId" AND w."isActive") AS "inventoryValue",
      (SELECT SUM(amount) FROM "DebtEntry" WHERE "partnerType" = 'CUSTOMER') AS receivable,
      (SELECT SUM(amount) FROM "DebtEntry" WHERE "partnerType" = 'SUPPLIER') AS payable`;

  const [series, topMaterials, pending, low, customerDebt] = await Promise.all([
    // Doanh thu và giá trị nhập theo ngày, 30 ngày gần nhất (đủ ngày, kể cả ngày không phát sinh).
    prisma.$queryRaw<{ day: string; revenue: Prisma.Decimal; purchase: Prisma.Decimal }[]>`
      WITH days AS (
        SELECT generate_series((now() AT TIME ZONE ${TZ})::date - 29, (now() AT TIME ZONE ${TZ})::date, interval '1 day')::date AS day
      ), docs AS (
        SELECT ("docDate" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ})::date AS day, type, "totalAmount"
        FROM "StockDocument"
        WHERE status = 'POSTED' AND type IN ('ISSUE', 'RECEIPT') AND "docDate" >= now() - interval '31 days'
      )
      SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(docs."totalAmount") FILTER (WHERE docs.type = 'ISSUE'), 0) AS revenue,
             COALESCE(SUM(docs."totalAmount") FILTER (WHERE docs.type = 'RECEIPT'), 0) AS purchase
      FROM days LEFT JOIN docs ON docs.day = days.day
      GROUP BY days.day ORDER BY days.day`,
    // Vật tư bán chạy nhất 30 ngày theo doanh thu.
    prisma.$queryRaw<{ code: string; name: string; revenue: Prisma.Decimal }[]>`
      SELECT m.code, m.name, SUM(l.amount) AS revenue
      FROM "StockDocumentLine" l
      JOIN "StockDocument" d ON d.id = l."documentId"
      JOIN "Material" m ON m.id = l."materialId"
      WHERE d.type = 'ISSUE' AND d.status = 'POSTED' AND d."docDate" >= now() - interval '30 days'
      GROUP BY m.id ORDER BY revenue DESC LIMIT 5`,
    Promise.all([
      prisma.purchaseOrder.count({ where: { status: 'DRAFT' } }),
      prisma.salesOrder.count({ where: { status: 'DRAFT' } }),
      prisma.purchaseOrder.count({ where: { status: { in: ['APPROVED', 'PARTIALLY_RECEIVED'] } } }),
      prisma.salesOrder.count({ where: { status: { in: ['APPROVED', 'PARTIALLY_DELIVERED'] } } }),
    ]),
    lowStockIds(),
    debtSummary('CUSTOMER'),
  ]);

  const s = (v: Prisma.Decimal | null) => (v ?? new D(0)).toDecimalPlaces(0).toString();
  const overdue = customerDebt.totals.aging;
  return {
    kpi: {
      revenueMonth: s(kpi.revenueMonth),
      revenuePrevMonth: s(kpi.revenuePrevMonth),
      purchaseMonth: s(kpi.purchaseMonth),
      inventoryValue: s(kpi.inventoryValue),
      receivable: s(kpi.receivable),
      receivableOverdue: new D(overdue.overdue1to30).plus(overdue.overdue31to60).plus(overdue.overdueOver60).toString(),
      payable: s(kpi.payable),
      lowStockCount: low.length,
    },
    pending: {
      purchaseOrdersToApprove: pending[0],
      salesOrdersToApprove: pending[1],
      purchaseOrdersToReceive: pending[2],
      salesOrdersToDeliver: pending[3],
    },
    series: series.map((r) => ({ day: r.day, revenue: s(r.revenue), purchase: s(r.purchase) })),
    topMaterials: topMaterials.map((r) => ({ code: r.code, name: r.name, revenue: s(r.revenue) })),
    topDebtors: customerDebt.rows.slice(0, 5).map((r) => ({ code: r.code, name: r.name, balance: r.balance })),
  };
}

// ───────────────────────── Nhập – xuất – tồn ─────────────────────────

export const movementQuery = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  warehouseId: z.coerce.number().int().positive().optional(),
});
export type MovementQuery = z.infer<typeof movementQuery>;

/** Ranh giới ngày theo giờ Việt Nam: [from 00:00, to 23:59:59.999] → UTC. */
function vnRange(from: Date, to: Date) {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()) - 7 * 3600_000);
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() + 1) - 7 * 3600_000 - 1);
  return { start, end };
}

/**
 * Báo cáo nhập – xuất – tồn theo kỳ.
 *
 * Cách tính để không phải cộng toàn bộ lịch sử sổ kho:
 *   tồn cuối kỳ = tồn hiện tại (StockBalance) − phát sinh sau cuối kỳ
 *   tồn đầu kỳ  = tồn cuối kỳ − phát sinh thuần trong kỳ
 * nên chỉ đọc các dòng sổ kho từ đầu kỳ trở đi (dùng index theo thời gian). Đúng vì StockBalance luôn bằng
 * tổng sổ kho (được cập nhật trong cùng transaction khi ghi sổ).
 * Xem tất cả kho thì không tính phiếu chuyển kho vào nhập/xuất (nhập kho này = xuất kho kia).
 */
export async function inventoryMovement(q: MovementQuery) {
  const { start, end } = vnRange(q.from, q.to);
  const balWh = q.warehouseId ? Prisma.sql`WHERE b."warehouseId" = ${q.warehouseId}` : Prisma.empty;
  const ledWh = q.warehouseId ? Prisma.sql`AND l."warehouseId" = ${q.warehouseId}` : Prisma.empty;
  const inPeriod = Prisma.sql`l."createdAt" <= ${end}`; // các dòng đã lọc >= start
  const notTransfer = q.warehouseId ? Prisma.sql`TRUE` : Prisma.sql`d.type <> 'TRANSFER'`;

  const rows = await prisma.$queryRaw<
    { id: number; code: string; name: string; unit: string; price: Prisma.Decimal;
      closing: Prisma.Decimal; net: Prisma.Decimal; qin: Prisma.Decimal; qout: Prisma.Decimal }[]
  >`
    WITH bal AS (
      SELECT b."materialId", SUM(b.quantity) AS qty FROM "StockBalance" b ${balWh} GROUP BY b."materialId"
    ), mv AS (
      SELECT l."materialId",
        SUM(l.quantity) FILTER (WHERE l."createdAt" > ${end}) AS after_end,
        SUM(l.quantity) FILTER (WHERE ${inPeriod}) AS net,
        SUM(l.quantity) FILTER (WHERE ${inPeriod} AND l.quantity > 0 AND ${notTransfer}) AS qin,
        -SUM(l.quantity) FILTER (WHERE ${inPeriod} AND l.quantity < 0 AND ${notTransfer}) AS qout
      FROM "StockLedger" l
      JOIN "StockDocument" d ON d.id = l."documentId"
      WHERE l."createdAt" >= ${start} ${ledWh}
      GROUP BY l."materialId"
    )
    SELECT m.id, m.code, m.name, u.name AS unit, m."purchasePrice" AS price,
      COALESCE(bal.qty, 0) - COALESCE(mv.after_end, 0) AS closing,
      COALESCE(mv.net, 0) AS net, COALESCE(mv.qin, 0) AS qin, COALESCE(mv.qout, 0) AS qout
    FROM "Material" m
    JOIN "Unit" u ON u.id = m."baseUnitId"
    LEFT JOIN bal ON bal."materialId" = m.id
    LEFT JOIN mv ON mv."materialId" = m.id
    WHERE bal."materialId" IS NOT NULL OR mv."materialId" IS NOT NULL
    ORDER BY m.code`;

  const items = rows
    .map((r) => {
      const closing = new D(r.closing);
      const opening = closing.minus(r.net);
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        unit: r.unit,
        opening: opening.toString(),
        in: r.qin.toString(),
        out: r.qout.toString(),
        closing: closing.toString(),
        closingValue: closing.mul(r.price).toDecimalPlaces(0).toString(),
      };
    })
    .filter((r) => [r.opening, r.in, r.out].some((v) => Number(v) !== 0));

  const warehouse = q.warehouseId ? await prisma.warehouse.findUnique({ where: { id: q.warehouseId } }) : null;
  return {
    from: q.from,
    to: q.to,
    warehouse: warehouse ? { id: warehouse.id, name: warehouse.name } : null,
    items,
    totalClosingValue: items.reduce((s, r) => s.plus(r.closingValue), new D(0)).toString(),
  };
}

// ───────────────────────── Excel ─────────────────────────

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
const fmtDate = (d: Date) => d.toLocaleDateString('vi-VN', { timeZone: TZ });

function titleRows(ws: ExcelJS.Worksheet, title: string, subtitle: string, width: number) {
  const last = String.fromCharCode(64 + width);
  ws.mergeCells(`A1:${last}1`);
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0F766E' } };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.mergeCells(`A2:${last}2`);
  ws.getCell('A2').value = subtitle;
  ws.getCell('A2').alignment = { horizontal: 'center' };
}

function headerRow(ws: ExcelJS.Worksheet, rowNo: number, labels: string[]) {
  const row = ws.getRow(rowNo);
  row.values = labels;
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 30;
  ws.views = [{ state: 'frozen', ySplit: rowNo }];
}

export async function inventoryMovementExcel(q: MovementQuery) {
  const report = await inventoryMovement(q);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Justin Stock';
  const ws = wb.addWorksheet('NhapXuatTon');
  ws.columns = [
    { width: 6 }, { width: 14 }, { width: 36 }, { width: 8 },
    { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 16 },
  ];
  titleRows(
    ws,
    'BÁO CÁO NHẬP – XUẤT – TỒN',
    `Từ ${fmtDate(q.from)} đến ${fmtDate(q.to)} · ${report.warehouse?.name ?? 'Tất cả kho'}`,
    9,
  );
  headerRow(ws, 4, ['STT', 'Mã vật tư', 'Tên vật tư', 'ĐVT', 'Tồn đầu', 'Nhập', 'Xuất', 'Tồn cuối', 'Giá trị tồn cuối']);
  report.items.forEach((r, i) => {
    ws.addRow([i + 1, r.code, r.name, r.unit, Number(r.opening), Number(r.in), Number(r.out), Number(r.closing), Number(r.closingValue)]);
  });
  const last = 4 + report.items.length;
  const total = ws.addRow(['', '', 'Tổng cộng', '', '', '', '', '', { formula: `SUM(I5:I${Math.max(5, last)})`, result: Number(report.totalClosingValue) }]);
  total.font = { bold: true };
  for (const c of [5, 6, 7, 8]) ws.getColumn(c).numFmt = '#,##0.###';
  ws.getColumn(9).numFmt = '#,##0';
  ws.autoFilter = { from: 'A4', to: `I${last}` };

  const from = q.from.toISOString().slice(0, 10);
  const to = q.to.toISOString().slice(0, 10);
  return { name: `nhap-xuat-ton_${from}_${to}.xlsx`, buffer: await wb.xlsx.writeBuffer() };
}

export async function debtExcel(type: 'CUSTOMER' | 'SUPPLIER') {
  const { rows, totals, paymentTermDays } = await debtSummary(type);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('CongNo');
  ws.columns = [{ width: 6 }, { width: 14 }, { width: 36 }, ...Array.from({ length: 7 }, () => ({ width: 15 }))];
  titleRows(
    ws,
    type === 'CUSTOMER' ? 'BÁO CÁO CÔNG NỢ PHẢI THU' : 'BÁO CÁO CÔNG NỢ PHẢI TRẢ',
    `Tại ngày ${fmtDate(new Date())} · hạn thanh toán ${paymentTermDays} ngày`,
    10,
  );
  headerRow(ws, 4, [
    'STT', 'Mã', type === 'CUSTOMER' ? 'Khách hàng' : 'Nhà cung cấp', 'Phát sinh', 'Đã thanh toán', 'Còn nợ',
    'Chưa đến hạn', 'Quá hạn 1–30 ngày', 'Quá hạn 31–60 ngày', 'Quá hạn > 60 ngày',
  ]);
  rows.forEach((r, i) => {
    const row = ws.addRow([
      i + 1, r.code, r.name, Number(r.increase), Number(r.decrease), Number(r.balance),
      Number(r.aging.current), Number(r.aging.overdue1to30), Number(r.aging.overdue31to60), Number(r.aging.overdueOver60),
    ]);
    if (Number(r.aging.overdueOver60) > 0) row.getCell(10).font = { color: { argb: 'FFB91C1C' }, bold: true };
  });
  const total = ws.addRow([
    '', '', 'Tổng cộng', Number(totals.increase), Number(totals.decrease), Number(totals.balance),
    Number(totals.aging.current), Number(totals.aging.overdue1to30), Number(totals.aging.overdue31to60), Number(totals.aging.overdueOver60),
  ]);
  total.font = { bold: true };
  for (let c = 4; c <= 10; c++) ws.getColumn(c).numFmt = '#,##0';
  return {
    name: `cong-no-${type === 'CUSTOMER' ? 'phai-thu' : 'phai-tra'}_${new Date().toISOString().slice(0, 10)}.xlsx`,
    buffer: await wb.xlsx.writeBuffer(),
  };
}
