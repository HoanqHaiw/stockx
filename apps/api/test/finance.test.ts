import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { ageDebt } from '../src/modules/finance/debts.service.js';
import { postStockDocument } from '../src/modules/stock/stock.service.js';
import { createUser, D, draftDoc, resetDb } from './helpers.js';

const app = createApp();
afterAll(() => prisma.$disconnect());

const auth: Record<'ADMIN' | 'SALES' | 'WAREHOUSE' | 'ACCOUNTANT', string> = { ADMIN: '', SALES: '', WAREHOUSE: '', ACCOUNTANT: '' };
let ids: { customer: number; customer2: number; wh: number; wh2: number; cable: number; m: number; admin: number };

beforeEach(async () => {
  await resetDb();
  for (const role of Object.keys(auth) as (keyof typeof auth)[]) {
    const u = await createUser(role);
    if (role === 'ADMIN') ids = { ...ids, admin: u.id };
    auth[role] = 'Bearer ' + (await request(app).post('/api/auth/login').send({ email: `${role.toLowerCase()}@test.local`, password: 'Secret@123' })).body.token;
  }
  const m = await prisma.unit.create({ data: { code: 'M', name: 'Mét' } });
  const group = await prisma.materialGroup.create({ data: { code: 'DIEN', name: 'Điện' } });
  const cable = await prisma.material.create({
    data: { code: 'DC-CV2.5', name: 'Dây CV 2.5', groupId: group.id, baseUnitId: m.id, purchasePrice: D(6800), salePrice: D(8300) },
  });
  const customer = await prisma.customer.create({ data: { code: 'KH-A', name: 'Khách A' } });
  const customer2 = await prisma.customer.create({ data: { code: 'KH-B', name: 'Khách B' } });
  const wh = await prisma.warehouse.create({ data: { code: 'A', name: 'Kho A' } });
  const wh2 = await prisma.warehouse.create({ data: { code: 'B', name: 'Kho B' } });
  ids = { ...ids, customer: customer.id, customer2: customer2.id, wh: wh.id, wh2: wh2.id, cable: cable.id, m: m.id };
  const doc = await draftDoc({ type: 'RECEIPT', warehouseId: wh.id, userId: ids.admin, lines: [{ materialId: cable.id, unitId: m.id, qty: 1000 }] });
  await postStockDocument(doc.id, ids.admin);
});

/** Bán và giao ngay cho khách, trả về tiền hàng. */
async function sell(customerId: number, qty: number) {
  const so = await request(app)
    .post('/api/sales-orders')
    .set('Authorization', auth.SALES)
    .send({ customerId, warehouseId: ids.wh, lines: [{ materialId: ids.cable, unitId: ids.m, quantity: qty, unitPrice: 10000 }] });
  await request(app).post(`/api/sales-orders/${so.body.id}/approve`).set('Authorization', auth.ADMIN);
  const issue = await request(app)
    .post(`/api/sales-orders/${so.body.id}/deliveries`)
    .set('Authorization', auth.WAREHOUSE)
    .send({ lines: [{ salesOrderLineId: so.body.lines[0].id, quantity: qty }] });
  return issue.body as { id: number };
}

const pay = (partnerId: number, amount: number) =>
  request(app).post('/api/payments').set('Authorization', auth.ACCOUNTANT).send({ partnerType: 'CUSTOMER', partnerId, amount });

describe('Phân tuổi nợ (FIFO)', () => {
  const now = new Date('2026-12-31T12:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const e = (amount: number, ago: number) => ({ amount: new Prisma.Decimal(amount), createdAt: daysAgo(ago) });

  it('trả tiền trừ vào khoản cũ nhất trước, phần còn lại xếp theo số ngày quá hạn', () => {
    const aging = ageDebt([
      e(1_000_000, 100), // quá hạn 70 ngày
      e(2_000_000, 75), // quá hạn 45 ngày
      e(3_000_000, 40), // quá hạn 10 ngày
      e(4_000_000, 5), // chưa đến hạn
      e(-1_500_000, 20), // trả: hết khoản 100 ngày + 500.000 của khoản 75 ngày
    ], now);
    expect(aging).toEqual({
      overdueOver60: '0',
      overdue31to60: '1500000',
      overdue1to30: '3000000',
      current: '4000000',
    });
  });

  it('trả hết thì không còn nợ ở nhóm nào', () => {
    const aging = ageDebt([e(500, 90), e(-500, 1)], now);
    expect(Object.values(aging).every((v) => v === '0')).toBe(true);
  });
});

describe('Công nợ và thanh toán', () => {
  it('giao hàng làm tăng phải thu, thu tiền làm giảm; sổ chi tiết có số dư luỹ kế', async () => {
    await sell(ids.customer, 100); // 1.000.000
    await sell(ids.customer, 50); // 500.000
    const p = await pay(ids.customer, 600000);
    expect(p.status).toBe(201);
    expect(p.body.code).toMatch(/^PT-/);
    expect(p.body.balanceAfter).toBe('900000');

    const summary = await request(app).get('/api/debts/customer').set('Authorization', auth.ACCOUNTANT);
    expect(summary.body.rows).toHaveLength(1);
    expect(summary.body.rows[0]).toMatchObject({ code: 'KH-A', increase: '1500000', decrease: '600000', balance: '900000' });
    expect(summary.body.rows[0].aging.current).toBe('900000');

    const ledger = await request(app).get(`/api/debts/customer/${ids.customer}`).set('Authorization', auth.ACCOUNTANT);
    expect(ledger.body.balance).toBe('900000');
    expect(ledger.body.rows.map((r: { balance: string }) => r.balance)).toEqual(['900000', '1500000', '1000000']);
    expect(ledger.body.rows[0].ref.code).toMatch(/^PT-/);
  });

  it('không cho thu vượt số nợ, kể cả khi hai kế toán nhập cùng lúc', async () => {
    await sell(ids.customer, 100); // nợ 1.000.000
    expect((await pay(ids.customer, 1_000_001)).status).toBe(409);

    const results = await Promise.all([pay(ids.customer, 700000), pay(ids.customer, 700000), pay(ids.customer, 700000)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    const agg = await prisma.debtEntry.aggregate({ _sum: { amount: true }, where: { customerId: ids.customer } });
    expect(Number(agg._sum.amount)).toBe(300000);
  });

  it('chỉ kế toán được ghi nhận thanh toán; kho không xem được công nợ', async () => {
    await sell(ids.customer, 10);
    const bySales = await request(app)
      .post('/api/payments')
      .set('Authorization', auth.SALES)
      .send({ partnerType: 'CUSTOMER', partnerId: ids.customer, amount: 1000 });
    expect(bySales.status).toBe(403);
    expect((await request(app).get('/api/debts/customer').set('Authorization', auth.WAREHOUSE)).status).toBe(403);
    expect((await request(app).get('/api/debts/customer').set('Authorization', auth.SALES)).status).toBe(200);
  });
});

describe('Báo cáo', () => {
  it('nhập – xuất – tồn: theo kho tính cả chuyển kho, tất cả kho thì bỏ qua chuyển kho', async () => {
    await sell(ids.customer, 100);
    await request(app)
      .post('/api/stock/transfers')
      .set('Authorization', auth.WAREHOUSE)
      .send({ fromWarehouseId: ids.wh, toWarehouseId: ids.wh2, lines: [{ materialId: ids.cable, unitId: ids.m, quantity: 200 }] });

    const today = new Date().toISOString().slice(0, 10);
    const all = await request(app).get(`/api/reports/inventory-movement?from=${today}&to=${today}`).set('Authorization', auth.ACCOUNTANT);
    expect(all.body.items[0]).toMatchObject({ code: 'DC-CV2.5', opening: '0', in: '1000', out: '100', closing: '900' });
    expect(all.body.totalClosingValue).toBe(String(900 * 6800));

    const atA = await request(app)
      .get(`/api/reports/inventory-movement?from=${today}&to=${today}&warehouseId=${ids.wh}`)
      .set('Authorization', auth.ACCOUNTANT);
    expect(atA.body.items[0]).toMatchObject({ in: '1000', out: '300', closing: '700' });

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const later = await request(app).get(`/api/reports/inventory-movement?from=${tomorrow}&to=${tomorrow}`).set('Authorization', auth.ACCOUNTANT);
    expect(later.body.items[0]).toMatchObject({ opening: '900', in: '0', out: '0', closing: '900' });
  });

  it('dashboard: doanh thu tháng, phải thu, đơn chờ, biểu đồ 30 ngày', async () => {
    await sell(ids.customer, 100);
    await sell(ids.customer2, 30);
    await pay(ids.customer, 400000);
    await request(app)
      .post('/api/sales-orders')
      .set('Authorization', auth.SALES)
      .send({ customerId: ids.customer, warehouseId: ids.wh, lines: [{ materialId: ids.cable, unitId: ids.m, quantity: 1, unitPrice: 1 }] });

    const res = await request(app).get('/api/reports/dashboard').set('Authorization', auth.WAREHOUSE);
    expect(res.status).toBe(200);
    expect(res.body.kpi).toMatchObject({ revenueMonth: '1300000', receivable: '900000', receivableOverdue: '0' });
    expect(res.body.pending.salesOrdersToApprove).toBe(1);
    expect(res.body.series).toHaveLength(30);
    expect(res.body.series.at(-1).revenue).toBe('1300000');
    expect(res.body.topMaterials[0]).toMatchObject({ code: 'DC-CV2.5', revenue: '1300000' });
    expect(res.body.topDebtors[0]).toMatchObject({ code: 'KH-A', balance: '600000' });
  });

  it('xuất Excel công nợ và nhập – xuất – tồn', async () => {
    await sell(ids.customer, 10);
    const today = new Date().toISOString().slice(0, 10);
    for (const url of ['/api/debts/customer/excel', `/api/reports/inventory-movement/excel?from=${today}&to=${today}`]) {
      const res = await request(app).get(url).set('Authorization', auth.ACCOUNTANT);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    }
  });
});
