import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { postStockDocument } from '../src/modules/stock/stock.service.js';
import { balanceOf, createUser, D, draftDoc, resetDb } from './helpers.js';

const app = createApp();
afterAll(() => prisma.$disconnect());

const auth: Record<'ADMIN' | 'SALES' | 'WAREHOUSE', string> = { ADMIN: '', SALES: '', WAREHOUSE: '' };
let ids: { customer: number; wh: number; cable: number; mcb: number; m: number; cuon: number; cai: number; admin: number };

beforeEach(async () => {
  await resetDb();
  for (const role of Object.keys(auth) as (keyof typeof auth)[]) {
    const u = await createUser(role);
    if (role === 'ADMIN') ids = { ...ids, admin: u.id };
    const res = await request(app).post('/api/auth/login').send({ email: `${role.toLowerCase()}@test.local`, password: 'Secret@123' });
    auth[role] = 'Bearer ' + res.body.token;
  }
  const [m, cuon, cai] = await Promise.all(
    [['M', 'Mét'], ['CUON', 'Cuộn'], ['CAI', 'Cái']].map(([code, name]) => prisma.unit.create({ data: { code, name } })),
  );
  const group = await prisma.materialGroup.create({ data: { code: 'DIEN', name: 'Điện' } });
  const cable = await prisma.material.create({
    data: {
      code: 'DC-CV2.5', name: 'Dây CV 2.5', groupId: group.id, baseUnitId: m.id, salePrice: D(8300),
      conversions: { create: [{ unitId: cuon.id, factor: D(100) }] },
    },
  });
  const mcb = await prisma.material.create({ data: { code: 'TB-MCB', name: 'Aptomat', groupId: group.id, baseUnitId: cai.id } });
  const customer = await prisma.customer.create({ data: { code: 'KH-A', name: 'Công ty Xây dựng A', taxCode: '0109876541' } });
  const wh = await prisma.warehouse.create({ data: { code: 'KHO-A', name: 'Kho A' } });
  ids = { ...ids, customer: customer.id, wh: wh.id, cable: cable.id, mcb: mcb.id, m: m.id, cuon: cuon.id, cai: cai.id };

  // Tồn đầu: 300 m dây, 10 aptomat.
  const doc = await draftDoc({
    type: 'RECEIPT', warehouseId: wh.id, userId: ids.admin,
    lines: [{ materialId: cable.id, unitId: m.id, qty: 300 }, { materialId: mcb.id, unitId: cai.id, qty: 10 }],
  });
  await postStockDocument(doc.id, ids.admin);
});

const lines = () => [
  { materialId: ids.cable, unitId: ids.cuon, quantity: 2, unitPrice: 830000 }, // 2 cuộn = 200 m
  { materialId: ids.mcb, unitId: ids.cai, quantity: 6, unitPrice: 89000 },
];

async function approvedOrder(orderLines = lines()) {
  const so = await request(app)
    .post('/api/sales-orders')
    .set('Authorization', auth.SALES)
    .send({ customerId: ids.customer, warehouseId: ids.wh, lines: orderLines });
  await request(app).post(`/api/sales-orders/${so.body.id}/approve`).set('Authorization', auth.ADMIN);
  return so.body as { id: number; lines: { id: number }[] };
}

const deliver = (soId: number, body: { salesOrderLineId: number; quantity: number }[]) =>
  request(app).post(`/api/sales-orders/${soId}/deliveries`).set('Authorization', auth.WAREHOUSE).send({ lines: body });

describe('Báo giá', () => {
  it('lập báo giá, gửi khách, chốt thành đơn bán với đúng dòng và giá', async () => {
    const q = await request(app)
      .post('/api/quotations')
      .set('Authorization', auth.SALES)
      .send({ customerId: ids.customer, note: 'Giao tại chân công trình', lines: lines() });
    expect(q.status).toBe(201);
    expect(q.body.code).toMatch(/^BG-/);
    expect(q.body.totalAmount).toBe('2194000');

    await request(app).post(`/api/quotations/${q.body.id}/send`).set('Authorization', auth.SALES);
    const so = await request(app)
      .post(`/api/quotations/${q.body.id}/convert`)
      .set('Authorization', auth.SALES)
      .send({ warehouseId: ids.wh });
    expect(so.status).toBe(201);
    expect(so.body).toMatchObject({ status: 'DRAFT', totalAmount: '2194000', quotation: { id: q.body.id } });
    expect(so.body.code).toMatch(/^DB-/);
    expect(so.body.lines[0]).toMatchObject({ baseQuantity: '200', unitPrice: '830000' });

    const again = await request(app)
      .post(`/api/quotations/${q.body.id}/convert`)
      .set('Authorization', auth.SALES)
      .send({ warehouseId: ids.wh });
    expect(again.status).toBe(409);
    const after = await request(app).get(`/api/quotations/${q.body.id}`).set('Authorization', auth.SALES);
    expect(after.body.status).toBe('ACCEPTED');
    expect(after.body.salesOrders).toHaveLength(1);
  });

  it('báo giá hết hạn thì không chốt được đơn', async () => {
    const q = await request(app)
      .post('/api/quotations')
      .set('Authorization', auth.SALES)
      .send({ customerId: ids.customer, validUntil: '2020-01-01', lines: lines() });
    const res = await request(app).post(`/api/quotations/${q.body.id}/convert`).set('Authorization', auth.SALES).send({ warehouseId: ids.wh });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/hết hạn/);
  });

  it('xuất file Excel báo giá có đủ dòng và tổng tiền', async () => {
    const q = await request(app).post('/api/quotations').set('Authorization', auth.SALES).send({ customerId: ids.customer, lines: lines() });
    const res = await request(app)
      .get(`/api/quotations/${q.body.id}/excel`)
      .set('Authorization', auth.SALES)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as ExcelJS.Buffer);
    const ws = wb.getWorksheet('BaoGia')!;
    expect(ws.getCell('C4').value).toBe('Công ty Xây dựng A');
    expect(ws.getRow(10).getCell(2).value).toBe('DC-CV2.5');
    expect(ws.getRow(10).getCell(4).value).toBe('Cuộn');
    expect((ws.getRow(12).getCell(7).value as { result: number }).result).toBe(2194000);
  });
});

describe('Đơn bán và xuất kho', () => {
  it('giao từng phần: trừ tồn, đổi trạng thái, ghi công nợ phải thu', async () => {
    const so = await approvedOrder();
    const first = await deliver(so.id, [{ salesOrderLineId: so.lines[0].id, quantity: 1 }]);
    expect(first.status).toBe(201);
    expect(first.body.code).toMatch(/^PX-/);
    expect(first.body.salesOrder.status).toBe('PARTIALLY_DELIVERED');
    expect(await balanceOf(ids.cable, ids.wh)).toBe(200);

    const second = await deliver(so.id, [
      { salesOrderLineId: so.lines[0].id, quantity: 1 },
      { salesOrderLineId: so.lines[1].id, quantity: 6 },
    ]);
    expect(second.body.salesOrder.status).toBe('DELIVERED');
    expect(await balanceOf(ids.cable, ids.wh)).toBe(100);
    expect(await balanceOf(ids.mcb, ids.wh)).toBe(4);

    const debt = await prisma.debtEntry.aggregate({ _sum: { amount: true }, where: { customerId: ids.customer } });
    expect(Number(debt._sum.amount)).toBe(2194000);
  });

  it('thiếu hàng thì từ chối cả phiếu và chỉ rõ vật tư thiếu', async () => {
    const so = await approvedOrder([
      { materialId: ids.cable, unitId: ids.cuon, quantity: 5, unitPrice: 830000 }, // cần 500 m, chỉ có 300
      { materialId: ids.mcb, unitId: ids.cai, quantity: 2, unitPrice: 89000 },
    ]);
    const res = await deliver(so.id, [
      { salesOrderLineId: so.lines[0].id, quantity: 5 },
      { salesOrderLineId: so.lines[1].id, quantity: 2 },
    ]);
    expect(res.status).toBe(409);
    expect(res.body.error.details.items).toEqual([
      expect.objectContaining({ materialCode: 'DC-CV2.5', available: '300', required: '500' }),
    ]);
    expect(await balanceOf(ids.mcb, ids.wh)).toBe(10); // dòng đủ hàng cũng không bị trừ
    const after = await request(app).get(`/api/sales-orders/${so.id}`).set('Authorization', auth.SALES);
    expect(after.body.status).toBe('APPROVED');
    expect(await prisma.debtEntry.count()).toBe(0);
  });

  it('hai đơn cùng giành một lượng hàng: chỉ đơn đến trước được xuất', async () => {
    const one = await approvedOrder([{ materialId: ids.cable, unitId: ids.m, quantity: 200, unitPrice: 8300 }]);
    const two = await approvedOrder([{ materialId: ids.cable, unitId: ids.m, quantity: 200, unitPrice: 8300 }]);
    const results = await Promise.all([
      deliver(one.id, [{ salesOrderLineId: one.lines[0].id, quantity: 200 }]),
      deliver(two.id, [{ salesOrderLineId: two.lines[0].id, quantity: 200 }]),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await balanceOf(ids.cable, ids.wh)).toBe(100);
  });

  it('không giao vượt số đặt; chưa duyệt không xuất được; phân quyền đúng vai trò', async () => {
    const draft = await request(app)
      .post('/api/sales-orders')
      .set('Authorization', auth.SALES)
      .send({ customerId: ids.customer, warehouseId: ids.wh, lines: lines() });
    expect((await deliver(draft.body.id, [{ salesOrderLineId: draft.body.lines[0].id, quantity: 1 }])).status).toBe(409);
    expect((await request(app).post(`/api/sales-orders/${draft.body.id}/approve`).set('Authorization', auth.SALES)).status).toBe(403);

    const so = await approvedOrder();
    const over = await deliver(so.id, [{ salesOrderLineId: so.lines[0].id, quantity: 3 }]);
    expect(over.status).toBe(409);
    expect(over.body.error.message).toMatch(/còn 2/);

    const bySales = await request(app)
      .post(`/api/sales-orders/${so.id}/deliveries`)
      .set('Authorization', auth.SALES)
      .send({ lines: [{ salesOrderLineId: so.lines[0].id, quantity: 1 }] });
    expect(bySales.status).toBe(403);
  });

  it('xem tồn khả dụng theo kho cho nhiều vật tư', async () => {
    const res = await request(app)
      .get(`/api/stock/balances?warehouseId=${ids.wh}&materialIds=${ids.cable},${ids.mcb}`)
      .set('Authorization', auth.SALES);
    expect(res.body).toEqual([
      { materialId: ids.cable, quantity: '300' },
      { materialId: ids.mcb, quantity: '10' },
    ]);
  });
});
