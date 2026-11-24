import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { postStockDocument } from '../src/modules/stock/stock.service.js';
import { createUser, draftDoc, resetDb } from './helpers.js';

const app = createApp();
afterAll(() => prisma.$disconnect());

let purchasing: string;
let warehouse: string;
let ids: { m: number; cuon: number; cai: number; dien: number; ong: number };

async function tokenFor(role: 'PURCHASING' | 'WAREHOUSE') {
  await createUser(role);
  const res = await request(app).post('/api/auth/login').send({ email: `${role.toLowerCase()}@test.local`, password: 'Secret@123' });
  return 'Bearer ' + res.body.token;
}

beforeEach(async () => {
  await resetDb();
  purchasing = await tokenFor('PURCHASING');
  warehouse = await tokenFor('WAREHOUSE');
  const [m, cuon, cai] = await Promise.all(
    [['M', 'Mét'], ['CUON', 'Cuộn'], ['CAI', 'Cái']].map(([code, name]) => prisma.unit.create({ data: { code, name } })),
  );
  const [dien, ong] = await Promise.all(
    [['DIEN', 'Điện'], ['ONG', 'Ống']].map(([code, name]) => prisma.materialGroup.create({ data: { code, name } })),
  );
  ids = { m: m.id, cuon: cuon.id, cai: cai.id, dien: dien.id, ong: ong.id };
});

const validMaterial = () => ({
  code: 'dc-cv2.5',
  name: 'Dây điện CV 2.5',
  specification: '',
  groupId: ids.dien,
  baseUnitId: ids.m,
  purchasePrice: 6800,
  salePrice: 8300,
  minStock: 500,
  conversions: [{ unitId: ids.cuon, factor: 100 }],
});

describe('API vật tư', () => {
  it('tạo vật tư: chuẩn hoá mã in hoa, lưu quy đổi, chuỗi rỗng thành null', async () => {
    const res = await request(app).post('/api/materials').set('Authorization', purchasing).send(validMaterial());
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('DC-CV2.5');
    expect(res.body.specification).toBeNull();
    expect(res.body.conversions).toHaveLength(1);
    expect(res.body.conversions[0]).toMatchObject({ factor: '100', unit: { code: 'CUON' } });
  });

  it('thủ kho chỉ được xem, không được tạo vật tư', async () => {
    const res = await request(app).post('/api/materials').set('Authorization', warehouse).send(validMaterial());
    expect(res.status).toBe(403);
    expect((await request(app).get('/api/materials').set('Authorization', warehouse)).status).toBe(200);
  });

  it('báo lỗi theo từng trường khi dữ liệu sai', async () => {
    const res = await request(app)
      .post('/api/materials')
      .set('Authorization', purchasing)
      .send({ ...validMaterial(), code: 'x', salePrice: -1, conversions: [{ unitId: ids.m, factor: 0 }] });
    expect(res.status).toBe(400);
    const fields = res.body.error.details.fieldErrors;
    expect(Object.keys(fields)).toEqual(expect.arrayContaining(['code', 'salePrice', 'conversions']));
  });

  it('trùng mã trả về 409', async () => {
    await request(app).post('/api/materials').set('Authorization', purchasing).send(validMaterial());
    const res = await request(app).post('/api/materials').set('Authorization', purchasing).send(validMaterial());
    expect(res.status).toBe(409);
  });

  it('không cho đổi đơn vị cơ sở khi vật tư đã có phát sinh kho', async () => {
    const created = await request(app).post('/api/materials').set('Authorization', purchasing).send(validMaterial());
    const wh = await prisma.warehouse.create({ data: { code: 'A', name: 'Kho A' } });
    const user = await prisma.user.findFirstOrThrow();
    const doc = await draftDoc({
      type: 'RECEIPT', warehouseId: wh.id, userId: user.id,
      lines: [{ materialId: created.body.id, unitId: ids.m, qty: 10 }],
    });
    await postStockDocument(doc.id, user.id);

    const res = await request(app)
      .put(`/api/materials/${created.body.id}`)
      .set('Authorization', purchasing)
      .send({ ...validMaterial(), baseUnitId: ids.cai, conversions: [] });
    expect(res.status).toBe(409);

    // Đổi các thông tin khác vẫn được.
    const ok = await request(app)
      .put(`/api/materials/${created.body.id}`)
      .set('Authorization', purchasing)
      .send({ ...validMaterial(), name: 'Dây CV 2.5 mới' });
    expect(ok.status).toBe(200);
  });

  it('lọc vật tư dưới mức tồn tối thiểu và tìm kiếm không phân biệt hoa thường', async () => {
    await request(app).post('/api/materials').set('Authorization', purchasing).send(validMaterial());
    await request(app)
      .post('/api/materials')
      .set('Authorization', purchasing)
      .send({ ...validMaterial(), code: 'ONG-PPR20', name: 'Ống PPR 20', groupId: ids.ong, minStock: 0, conversions: [] });

    const low = await request(app).get('/api/materials?lowStock=true').set('Authorization', warehouse);
    expect(low.body.items.map((m: { code: string }) => m.code)).toEqual(['DC-CV2.5']);

    const search = await request(app).get('/api/materials?q=ppr').set('Authorization', warehouse);
    expect(search.body.total).toBe(1);
  });
});

// ───────────────────────── Excel ─────────────────────────

async function xlsx(rows: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('VatTu');
  ws.addRow(['Mã vật tư *', 'Tên vật tư *', 'Quy cách', 'Mã nhóm *', 'ĐVT cơ sở *', 'Giá mua', 'Giá bán', 'Tồn tối thiểu', 'Quy đổi']);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

const upload = (buf: Buffer, dryRun = false) =>
  request(app)
    .post(`/api/materials/import${dryRun ? '?dryRun=true' : ''}`)
    .set('Authorization', purchasing)
    .attach('file', buf, 'vat-tu.xlsx');

describe('Nhập/xuất Excel vật tư', () => {
  it('kiểm tra trước (dryRun) không ghi gì, nhập thật thì tạo mới và cập nhật', async () => {
    await request(app).post('/api/materials').set('Authorization', purchasing).send(validMaterial());
    const file = await xlsx([
      ['DC-CV2.5', 'Dây CV 2.5 (cập nhật)', '', 'DIEN', 'M', '6.900', 8500, 400, 'CUON=100'],
      ['ong-ppr20', 'Ống PPR D20', 'Dài 4m', 'ong', 'm', 18500, 24000, 200, 'CAI=1; CUON=4'],
    ]);

    const preview = await upload(file, true);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ total: 2, toCreate: 1, toUpdate: 1, applied: false, errors: [] });
    expect(await prisma.material.count()).toBe(1);

    const applied = await upload(file);
    expect(applied.status).toBe(200);
    expect(applied.body.applied).toBe(true);
    const updated = await prisma.material.findUniqueOrThrow({ where: { code: 'DC-CV2.5' } });
    expect(updated.name).toBe('Dây CV 2.5 (cập nhật)');
    expect(Number(updated.purchasePrice)).toBe(6900); // "6.900" kiểu Việt Nam
    const ppr = await prisma.material.findUniqueOrThrow({ where: { code: 'ONG-PPR20' }, include: { conversions: true } });
    expect(ppr.conversions).toHaveLength(2);
  });

  it('có dòng lỗi thì không ghi dòng nào, trả danh sách lỗi và file lỗi', async () => {
    const file = await xlsx([
      ['TB-OK', 'Hợp lệ', '', 'DIEN', 'CAI', 1000, 2000, 0, ''],
      ['TB-BAD', '', '', 'KHONGCO', 'CAI', 'abc', 2000, 0, 'HOP=10'],
      ['TB-OK', 'Trùng mã', '', 'DIEN', 'CAI', 1000, 2000, 0, 'CUON100'],
    ]);
    const res = await upload(file);
    expect(res.status).toBe(422);
    expect(res.body.applied).toBe(false);
    expect(await prisma.material.count()).toBe(0);

    const byRow = Object.fromEntries(res.body.errors.map((e: { row: number; messages: string[] }) => [e.row, e.messages.join(' | ')]));
    expect(Object.keys(byRow)).toEqual(['3', '4']);
    expect(byRow[3]).toMatch(/Mã nhóm "KHONGCO" không tồn tại/);
    expect(byRow[3]).toMatch(/Tên vật tư/);
    expect(byRow[3]).toMatch(/Giá mua/);
    expect(byRow[3]).toMatch(/đơn vị "HOP" không tồn tại/);
    expect(byRow[4]).toMatch(/trùng với dòng 2/);
    expect(byRow[4]).toMatch(/sai định dạng/);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(res.body.errorFile, 'base64') as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    expect(ws.getRow(1).getCell(10).value).toBe('Lỗi');
    expect(String(ws.getRow(3).getCell(10).value)).toMatch(/KHONGCO/);
    expect(ws.getRow(2).getCell(10).value).toBe('');
  });

  it('từ chối file thiếu cột bắt buộc hoặc không phải Excel', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('VatTu').addRow(['Mã vật tư', 'Tên vật tư']);
    const missingCols = await upload(Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer));
    expect(missingCols.status).toBe(400);
    expect(missingCols.body.error.message).toMatch(/Thiếu cột bắt buộc/);

    const notExcel = await request(app)
      .post('/api/materials/import')
      .set('Authorization', purchasing)
      .attach('file', Buffer.from('hello'), 'fake.xlsx');
    expect(notExcel.status).toBe(400);
  });

  it('xuất Excel đủ cột và tổng tồn', async () => {
    await request(app).post('/api/materials').set('Authorization', purchasing).send(validMaterial());
    const res = await request(app)
      .get('/api/materials/export')
      .set('Authorization', warehouse)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as ExcelJS.Buffer);
    const ws = wb.getWorksheet('VatTu')!;
    expect(ws.getRow(1).getCell(1).value).toBe('Mã vật tư');
    expect(ws.getRow(2).getCell(1).value).toBe('DC-CV2.5');
    expect(ws.getRow(2).getCell(9).value).toBe('CUON=100');
    expect(ws.getRow(2).getCell(10).value).toBe(0);
  });
});

describe('API nhà cung cấp / khách hàng', () => {
  it('mua hàng quản lý NCC, kiểm tra mã số thuế, ngừng sử dụng thay vì xoá', async () => {
    const bad = await request(app)
      .post('/api/suppliers')
      .set('Authorization', purchasing)
      .send({ code: 'NCC-A', name: 'NCC A', taxCode: '123' });
    expect(bad.status).toBe(400);

    const created = await request(app)
      .post('/api/suppliers')
      .set('Authorization', purchasing)
      .send({ code: 'ncc-a', name: 'NCC A', taxCode: '0101234567', email: '' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ code: 'NCC-A', email: null });

    await request(app).patch(`/api/suppliers/${created.body.id}/active`).set('Authorization', purchasing).send({ isActive: false });
    const active = await request(app).get('/api/suppliers').set('Authorization', purchasing);
    const all = await request(app).get('/api/suppliers?active=all').set('Authorization', purchasing);
    expect(active.body.total).toBe(0);
    expect(all.body.total).toBe(1);
  });

  it('mua hàng không được sửa khách hàng', async () => {
    const res = await request(app).post('/api/customers').set('Authorization', purchasing).send({ code: 'KH-A', name: 'KH A' });
    expect(res.status).toBe(403);
  });
});
