import ExcelJS from 'exceljs';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';

const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString('vi-VN') : '');

/** File báo giá gửi khách hàng: thông tin khách, bảng hàng, tổng tiền, hiệu lực. */
export async function quotationWorkbook(id: number): Promise<{ name: string; buffer: ExcelJS.Buffer }> {
  const q = await prisma.quotation.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: { select: { fullName: true, email: true } },
      lines: { orderBy: { id: 'asc' }, include: { material: true } },
    },
  });
  if (!q) throw notFound('Không tìm thấy báo giá');
  const units = await prisma.unit.findMany({ where: { id: { in: q.lines.map((l) => l.unitId) } } });
  const unitName = new Map(units.map((u) => [u.id, u.name]));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Justin Stock';
  const ws = wb.addWorksheet('BaoGia', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 } });
  ws.columns = [
    { key: 'stt', width: 6 },
    { key: 'code', width: 14 },
    { key: 'name', width: 40 },
    { key: 'unit', width: 9 },
    { key: 'qty', width: 10 },
    { key: 'price', width: 14 },
    { key: 'amount', width: 16 },
  ];

  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = 'BÁO GIÁ VẬT TƯ';
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF0F766E' } };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.mergeCells('A2:G2');
  ws.getCell('A2').value = `Số: ${q.code}   Ngày: ${fmtDate(q.quoteDate)}`;
  ws.getCell('A2').alignment = { horizontal: 'center' };

  const info: [string, string][] = [
    ['Kính gửi:', q.customer.name],
    ['Mã số thuế:', q.customer.taxCode ?? ''],
    ['Địa chỉ:', q.customer.address ?? ''],
    ['Người báo giá:', `${q.createdBy.fullName} (${q.createdBy.email})`],
  ];
  info.forEach(([label, value], i) => {
    const r = 4 + i;
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`A${r}`).font = { bold: true };
    ws.mergeCells(`C${r}:G${r}`);
    ws.getCell(`C${r}`).value = value;
  });

  const headerRow = ws.getRow(9);
  headerRow.values = ['STT', 'Mã hàng', 'Tên hàng / quy cách', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền'];
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  q.lines.forEach((l, i) => {
    const row = ws.getRow(10 + i);
    row.values = [
      i + 1,
      l.material.code,
      l.material.specification ? `${l.material.name} – ${l.material.specification}` : l.material.name,
      unitName.get(l.unitId) ?? '',
      Number(l.quantity),
      Number(l.unitPrice),
      Number(l.amount),
    ];
    row.getCell(3).alignment = { wrapText: true };
  });
  const last = 9 + q.lines.length;
  for (let r = 9; r <= last; r++) {
    for (let c = 1; c <= 7; c++) {
      ws.getRow(r).getCell(c).border = {
        top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' },
      };
    }
  }
  ws.getColumn('qty').numFmt = '#,##0.###';
  ws.getColumn('price').numFmt = '#,##0';
  ws.getColumn('amount').numFmt = '#,##0';

  const totalRow = ws.getRow(last + 1);
  ws.mergeCells(`A${last + 1}:F${last + 1}`);
  totalRow.getCell(1).value = 'Tổng cộng (chưa gồm VAT)';
  totalRow.getCell(1).alignment = { horizontal: 'right' };
  totalRow.getCell(7).value = { formula: `SUM(G10:G${last})`, result: Number(q.totalAmount) };
  totalRow.font = { bold: true };

  const notes = [
    q.validUntil ? `Báo giá có hiệu lực đến hết ngày ${fmtDate(q.validUntil)}.` : 'Báo giá có hiệu lực 15 ngày.',
    ...(q.note ? [`Ghi chú: ${q.note}`] : []),
  ];
  notes.forEach((n, i) => {
    ws.mergeCells(`A${last + 3 + i}:G${last + 3 + i}`);
    ws.getCell(`A${last + 3 + i}`).value = n;
    ws.getCell(`A${last + 3 + i}`).font = { italic: true };
  });

  return { name: `bao-gia-${q.code}.xlsx`, buffer: await wb.xlsx.writeBuffer() };
}
