import ExcelJS from 'exceljs';
import { prisma } from '../../lib/prisma.js';
import { badRequest } from '../../lib/errors.js';
import {
  createMaterialTx,
  materialInclude,
  materialSchema,
  totalStockOf,
  updateMaterialTx,
  type MaterialInput,
} from './materials.service.js';

/** Cột của file Excel vật tư. Dùng chung cho xuất, file mẫu và nhập. */
const COLUMNS = [
  { key: 'code', header: 'Mã vật tư', width: 16, required: true },
  { key: 'name', header: 'Tên vật tư', width: 36, required: true },
  { key: 'specification', header: 'Quy cách', width: 28, required: false },
  { key: 'groupCode', header: 'Mã nhóm', width: 12, required: true },
  { key: 'baseUnitCode', header: 'ĐVT cơ sở', width: 11, required: true },
  { key: 'purchasePrice', header: 'Giá mua', width: 14, required: false },
  { key: 'salePrice', header: 'Giá bán', width: 14, required: false },
  { key: 'minStock', header: 'Tồn tối thiểu', width: 13, required: false },
  { key: 'conversions', header: 'Quy đổi', width: 22, required: false },
] as const;
type ColumnKey = (typeof COLUMNS)[number]['key'];
type RawRow = Record<ColumnKey, string>;

const FIELD_LABEL: Record<string, string> = Object.fromEntries([
  ...COLUMNS.map((c) => [c.key, c.header]),
  ['groupId', 'Mã nhóm'],
  ['baseUnitId', 'ĐVT cơ sở'],
]);

export const MAX_IMPORT_ROWS = 2000;
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: 'middle' };
  row.height = 20;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

const conversionText = (conversions: { unit: { code: string }; factor: { toString(): string } }[]) =>
  conversions.map((c) => `${c.unit.code}=${c.factor.toString()}`).join('; ');

// ───────────────────────── Xuất ─────────────────────────

export async function exportMaterials(): Promise<ExcelJS.Buffer> {
  const materials = await prisma.material.findMany({ include: materialInclude, orderBy: { code: 'asc' } });
  const stock = await totalStockOf(materials.map((m) => m.id));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Justin Stock';
  const ws = wb.addWorksheet('VatTu');
  ws.columns = [
    ...COLUMNS.map((c) => ({ key: c.key, header: c.header, width: c.width })),
    { key: 'stock', header: 'Tổng tồn', width: 12 },
    { key: 'status', header: 'Trạng thái', width: 14 },
  ];
  for (const m of materials) {
    const total = Number(stock.get(m.id) ?? 0);
    const row = ws.addRow({
      code: m.code,
      name: m.name,
      specification: m.specification ?? '',
      groupCode: m.group.code,
      baseUnitCode: m.baseUnit.code,
      purchasePrice: Number(m.purchasePrice),
      salePrice: Number(m.salePrice),
      minStock: Number(m.minStock),
      conversions: conversionText(m.conversions),
      stock: total,
      status: m.isActive ? 'Đang dùng' : 'Ngừng dùng',
    });
    if (m.isActive && total < Number(m.minStock)) {
      row.getCell('stock').font = { color: { argb: 'FFB91C1C' }, bold: true };
    }
  }
  for (const key of ['purchasePrice', 'salePrice'] as const) ws.getColumn(key).numFmt = '#,##0';
  for (const key of ['minStock', 'stock'] as const) ws.getColumn(key).numFmt = '#,##0.###';
  styleHeader(ws);
  ws.autoFilter = { from: 'A1', to: { row: 1, column: ws.columnCount } };
  return wb.xlsx.writeBuffer();
}

// ───────────────────────── File mẫu ─────────────────────────

export async function importTemplate(): Promise<ExcelJS.Buffer> {
  const [groups, units] = await Promise.all([
    prisma.materialGroup.findMany({ orderBy: { code: 'asc' } }),
    prisma.unit.findMany({ orderBy: { code: 'asc' } }),
  ]);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('VatTu');
  ws.columns = COLUMNS.map((c) => ({ key: c.key, header: c.header, width: c.width }));
  ws.addRow({
    code: 'DC-CV6', name: 'Dây điện đơn CV 6mm²', specification: '1 lõi đồng, cách điện PVC',
    groupCode: groups[0]?.code ?? 'DIEN', baseUnitCode: 'M', purchasePrice: 15800, salePrice: 19200,
    minStock: 200, conversions: 'CUON=100',
  });
  styleHeader(ws);
  COLUMNS.forEach((c, i) => {
    if (c.required) ws.getRow(1).getCell(i + 1).value = `${c.header} *`;
  });

  const guide = wb.addWorksheet('HuongDan');
  guide.columns = [{ width: 24 }, { width: 60 }];
  guide.addRows([
    ['Hướng dẫn nhập vật tư'],
    ['Cột có dấu *', 'Bắt buộc nhập'],
    ['Mã vật tư', 'Đã tồn tại thì cập nhật, chưa có thì tạo mới'],
    ['Quy đổi', 'Dạng MÃ_ĐVT=hệ số, cách nhau bởi dấu ;  Ví dụ: CUON=100; THUNG=20'],
    ['Giới hạn', `Tối đa ${MAX_IMPORT_ROWS} dòng mỗi lần. Có dòng lỗi thì không dòng nào được ghi.`],
    [],
    ['Mã nhóm hợp lệ', groups.map((g) => `${g.code} (${g.name})`).join(', ')],
    ['Mã ĐVT hợp lệ', units.map((u) => `${u.code} (${u.name})`).join(', ')],
  ]);
  guide.getRow(1).font = { bold: true, size: 13 };
  guide.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
  return wb.xlsx.writeBuffer();
}

// ───────────────────────── Nhập ─────────────────────────

/** Lấy giá trị hiển thị của ô, xử lý cả công thức, rich text, hyperlink. */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('result' in v) return String(v.result ?? '').trim();
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim();
    if ('text' in v) return String(v.text).trim();
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}

const normalizeHeader = (s: string) => s.replace(/\*/g, '').trim().toLowerCase();

function parseConversions(text: string, unitIdByCode: Map<string, number>, errors: string[]) {
  if (!text) return [];
  return text
    .split(/[;,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const m = /^([A-Za-z0-9._-]+)\s*=\s*([\d.]+)$/.exec(part);
      if (!m) {
        errors.push(`Quy đổi: "${part}" sai định dạng, cần dạng CUON=100`);
        return [];
      }
      const unitId = unitIdByCode.get(m[1].toUpperCase());
      if (!unitId) {
        errors.push(`Quy đổi: đơn vị "${m[1]}" không tồn tại`);
        return [];
      }
      return [{ unitId, factor: Number(m[2]) }];
    });
}

/** Chuỗi số kiểu Việt Nam "15.800" hoặc "15,800" → 15800. Ô rỗng → undefined để dùng mặc định. */
function parseNumber(text: string): number | string | undefined {
  if (text === '') return undefined;
  const cleaned = text.replace(/\s/g, '');
  if (/^\d{1,3}([.,]\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/[.,]/g, ''));
  const n = Number(cleaned.replace(',', '.'));
  return Number.isFinite(n) ? n : text; // để Zod báo lỗi "không phải số"
}

export interface ImportRowError {
  row: number;
  code: string;
  messages: string[];
}

export interface ImportResult {
  total: number;
  toCreate: number;
  toUpdate: number;
  errors: ImportRowError[];
  applied: boolean;
  errorFile?: string; // base64 xlsx, chỉ có khi có lỗi
}

export async function importMaterials(buffer: Buffer, opts: { dryRun: boolean }): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw badRequest('File không đúng định dạng Excel .xlsx');
  }
  const ws = wb.getWorksheet('VatTu') ?? wb.worksheets[0];
  if (!ws) throw badRequest('File không có trang tính nào');

  // Tìm vị trí cột theo tiêu đề, cho phép người dùng đổi thứ tự cột.
  const colIndex = new Map<ColumnKey, number>();
  ws.getRow(1).eachCell((cell, col) => {
    const h = normalizeHeader(cellText(cell));
    const def = COLUMNS.find((c) => c.header.toLowerCase() === h);
    if (def) colIndex.set(def.key, col);
  });
  const missing = COLUMNS.filter((c) => c.required && !colIndex.has(c.key)).map((c) => c.header);
  if (missing.length) throw badRequest(`Thiếu cột bắt buộc: ${missing.join(', ')}. Hãy dùng file mẫu.`);

  const rows: { rowNumber: number; raw: RawRow }[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const raw = Object.fromEntries(
      COLUMNS.map((c) => [c.key, colIndex.has(c.key) ? cellText(row.getCell(colIndex.get(c.key)!)) : '']),
    ) as RawRow;
    if (Object.values(raw).some((v) => v !== '')) rows.push({ rowNumber, raw });
  });
  if (rows.length === 0) throw badRequest('File không có dòng dữ liệu nào');
  if (rows.length > MAX_IMPORT_ROWS) throw badRequest(`Tối đa ${MAX_IMPORT_ROWS} dòng mỗi lần nhập`);

  const [groups, units, existing] = await Promise.all([
    prisma.materialGroup.findMany(),
    prisma.unit.findMany(),
    prisma.material.findMany({
      where: { code: { in: rows.map((r) => r.raw.code.toUpperCase()) } },
      select: { id: true, code: true, baseUnitId: true, _count: { select: { ledger: true } } },
    }),
  ]);
  const groupIdByCode = new Map(groups.map((g) => [g.code, g.id]));
  const unitIdByCode = new Map(units.map((u) => [u.code, u.id]));
  const existingByCode = new Map(existing.map((m) => [m.code, m]));

  const errors: ImportRowError[] = [];
  const valid: { existingId?: number; input: MaterialInput }[] = [];
  const seenCodes = new Map<string, number>();

  for (const { rowNumber, raw } of rows) {
    const messages: string[] = [];
    const code = raw.code.toUpperCase();

    const groupId = groupIdByCode.get(raw.groupCode.toUpperCase());
    if (raw.groupCode && !groupId) messages.push(`Mã nhóm "${raw.groupCode}" không tồn tại`);
    const baseUnitId = unitIdByCode.get(raw.baseUnitCode.toUpperCase());
    if (raw.baseUnitCode && !baseUnitId) messages.push(`ĐVT "${raw.baseUnitCode}" không tồn tại`);
    const conversions = parseConversions(raw.conversions, unitIdByCode, messages);

    const parsed = materialSchema.safeParse({
      code: raw.code,
      name: raw.name,
      specification: raw.specification,
      groupId: groupId ?? (raw.groupCode ? -1 : undefined),
      baseUnitId: baseUnitId ?? (raw.baseUnitCode ? -1 : undefined),
      purchasePrice: parseNumber(raw.purchasePrice),
      salePrice: parseNumber(raw.salePrice),
      minStock: parseNumber(raw.minStock),
      conversions,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '');
        // Mã nhóm / ĐVT sai đã báo ở trên, không báo trùng.
        if ((field === 'groupId' && raw.groupCode) || (field === 'baseUnitId' && raw.baseUnitCode)) continue;
        const label = FIELD_LABEL[field] ?? field;
        const message = issue.code === 'invalid_type' && issue.received === 'undefined' ? 'Bắt buộc nhập' : issue.message;
        messages.push(`${label}: ${message}`);
      }
    }

    if (code && seenCodes.has(code)) messages.push(`Mã vật tư trùng với dòng ${seenCodes.get(code)}`);
    else if (code) seenCodes.set(code, rowNumber);

    const current = existingByCode.get(code);
    if (parsed.success && current && current.baseUnitId !== parsed.data.baseUnitId && current._count.ledger > 0) {
      messages.push('Vật tư đã có phát sinh kho nên không được đổi ĐVT cơ sở');
    }

    if (messages.length) errors.push({ row: rowNumber, code: raw.code, messages });
    else if (parsed.success) valid.push({ existingId: current?.id, input: parsed.data });
  }

  const result: ImportResult = {
    total: rows.length,
    toCreate: valid.filter((v) => !v.existingId).length,
    toUpdate: valid.filter((v) => v.existingId).length,
    errors,
    applied: false,
  };

  if (errors.length) {
    result.errorFile = await buildErrorFile(rows, errors);
    return result;
  }
  if (opts.dryRun) return result;

  // Ghi tất cả trong một transaction: hoặc thành công hết, hoặc không ghi gì.
  await prisma.$transaction(
    async (tx) => {
      for (const v of valid) {
        if (v.existingId) await updateMaterialTx(tx, v.existingId, v.input);
        else await createMaterialTx(tx, v.input);
      }
    },
    { timeout: 60_000 },
  );
  result.applied = true;
  return result;
}

/** File lỗi: giữ nguyên dữ liệu người dùng nhập, thêm cột "Lỗi" và tô đỏ dòng sai. */
async function buildErrorFile(rows: { rowNumber: number; raw: RawRow }[], errors: ImportRowError[]) {
  const errorsByRow = new Map(errors.map((e) => [e.row, e.messages.join('\n')]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('VatTu');
  ws.columns = [
    ...COLUMNS.map((c) => ({ key: c.key, header: c.header, width: c.width })),
    { key: 'error', header: 'Lỗi', width: 50 },
  ];
  for (const { rowNumber, raw } of rows) {
    const message = errorsByRow.get(rowNumber);
    const row = ws.addRow({ ...raw, error: message ?? '' });
    if (message) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      row.getCell('error').font = { color: { argb: 'FFB91C1C' } };
      row.getCell('error').alignment = { wrapText: true, vertical: 'top' };
    }
  }
  styleHeader(ws);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer).toString('base64');
}
