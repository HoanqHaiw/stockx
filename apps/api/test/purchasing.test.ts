import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { balanceOf, createUser, D, resetDb } from './helpers.js';

const app = createApp();
afterAll(() => prisma.$disconnect());

const auth: Record<'ADMIN' | 'PURCHASING' | 'WAREHOUSE', string> = { ADMIN: '', PURCHASING: '', WAREHOUSE: '' };
let ids: { supplier: number; wh: number; cable: number; mcb: number; m: number; cuon: number; cai: number; hop: number };

beforeEach(async () => {
  await resetDb();
  for (const role of Object.keys(auth) as (keyof typeof auth)[]) {
    await createUser(role);
    const res = await request(app).post('/api/auth/login').send({ email: `${role.toLowerCase()}@test.local`, password: 'Secret@123' });
    auth[role] = 'Bearer ' + res.body.token;
  }
  const [m, cuon, cai, hop] = await Promise.all(
    [['M', 'Mét'], ['CUON', 'Cuộn'], ['CAI', 'Cái'], ['HOP', 'Hộp']].map(([code, name]) => prisma.unit.create({ data: { code, name } })),
  );
  const group = await prisma.materialGroup.create({ data: { code: 'DIEN', name: 'Điện' } });
  const cable = await prisma.material.create({
    data: {
      code: 'DC-CV2.5', name: 'Dây CV 2.5', groupId: group.id, baseUnitId: m.id, purchasePrice: D(6800),
      conversions: { create: [{ unitId: cuon.id, factor: D(100) }] },
    },
  });
  const mcb = await prisma.material.create({
    data: {
      code: 'TB-MCB', name: 'Aptomat', groupId: group.id, baseUnitId: cai.id,
      conversions: { create: [{ unitId: hop.id, factor: D(12) }] },
    },
  });
  const supplier = await prisma.supplier.create({ data: { code: 'NCC-A', name: 'NCC A' } });
  const wh = await prisma.warehouse.create({ data: { code: 'KHO-A', name: 'Kho A' } });
  ids = { supplier: supplier.id, wh: wh.id, cable: cable.id, mcb: mcb.id, m: m.id, cuon: cuon.id, cai: cai.id, hop: hop.id };
});

const poBody = () => ({
  supplierId: ids.supplier,
  warehouseId: ids.wh,
  note: 'Bổ sung hàng tháng 12',
  lines: [
    { materialId: ids.cable, unitId: ids.cuon, quantity: 5, unitPrice: 650000 }, // 5 cuộn = 500 m
    { materialId: ids.mcb, unitId: ids.hop, quantity: 2, unitPrice: 780000 }, // 2 hộp = 24 cái
  ],
});

async function createApprovedPo() {
  const created = await request(app).post('/api/purchase-orders').set('Authorization', auth.PURCHASING).send(poBody());
  await request(app).post(`/api/purchase-orders/${created.body.id}/approve`).set('Authorization', auth.ADMIN);
  return created.body as { id: number; lines: { id: number }[] };
}

const receive = (poId: number, lines: { purchaseOrderLineId: number; quantity: number }[]) =>
  request(app).post(`/api/purchase-orders/${poId}/receipts`).set('Authorization', auth.WAREHOUSE).send({ lines });

describe('Đơn mua hàng', () => {
  it('tạo đơn: quy đổi về đơn vị cơ sở, tính thành tiền, sinh số PO', async () => {
    const res = await request(app).post('/api/purchase-orders').set('Authorization', auth.PURCHASING).send(poBody());
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^PO-\d{4}-0001$/);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.totalAmount).toBe('4810000'); // 5×650.000 + 2×780.000
    expect(res.body.lines[0]).toMatchObject({ factor: '100', baseQuantity: '500', amount: '3250000' });
    expect(res.body.lines[1]).toMatchObject({ factor: '12', baseQuantity: '24' });
  });

  it('từ chối đơn vị không thuộc vật tư', async () => {
    const body = poBody();
    body.lines[1].unitId = ids.cuon; // aptomat không có đơn vị "cuộn"
    const res = await request(app).post('/api/purchase-orders').set('Authorization', auth.PURCHASING).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Dòng 2: đơn vị tính không áp dụng/);
  });

  it('chỉ quản trị được duyệt; đơn đã duyệt không sửa được', async () => {
    const created = await request(app).post('/api/purchase-orders').set('Authorization', auth.PURCHASING).send(poBody());
    const selfApprove = await request(app).post(`/api/purchase-orders/${created.body.id}/approve`).set('Authorization', auth.PURCHASING);
    expect(selfApprove.status).toBe(403);

    const approved = await request(app).post(`/api/purchase-orders/${created.body.id}/approve`).set('Authorization', auth.ADMIN);
    expect(approved.body).toMatchObject({ status: 'APPROVED', approvedBy: { fullName: 'User ADMIN' } });

    const edit = await request(app).put(`/api/purchase-orders/${created.body.id}`).set('Authorization', auth.PURCHASING).send(poBody());
    expect(edit.status).toBe(409);
  });

  it('không nhập kho được với đơn chưa duyệt', async () => {
    const created = await request(app).post('/api/purchase-orders').set('Authorization', auth.PURCHASING).send(poBody());
    const res = await receive(created.body.id, [{ purchaseOrderLineId: created.body.lines[0].id, quantity: 1 }]);
    expect(res.status).toBe(409);
  });
});

describe('Nhập kho theo đơn mua', () => {
  it('nhận từng phần rồi nhận đủ: cập nhật tồn, trạng thái đơn, công nợ', async () => {
    const po = await createApprovedPo();
    const [cableLine, mcbLine] = po.lines;

    const first = await receive(po.id, [{ purchaseOrderLineId: cableLine.id, quantity: 2 }]);
    expect(first.status).toBe(201);
    expect(first.body.code).toMatch(/^PN-/);
    expect(first.body.purchaseOrder.status).toBe('PARTIALLY_RECEIVED');
    expect(await balanceOf(ids.cable, ids.wh)).toBe(200);

    const second = await receive(po.id, [
      { purchaseOrderLineId: cableLine.id, quantity: 3 },
      { purchaseOrderLineId: mcbLine.id, quantity: 2 },
    ]);
    expect(second.body.purchaseOrder.status).toBe('RECEIVED');
    expect(await balanceOf(ids.cable, ids.wh)).toBe(500);
    expect(await balanceOf(ids.mcb, ids.wh)).toBe(24);

    const debt = await prisma.debtEntry.aggregate({ _sum: { amount: true }, where: { supplierId: ids.supplier } });
    expect(Number(debt._sum.amount)).toBe(4810000);

    const detail = await request(app).get(`/api/purchase-orders/${po.id}`).set('Authorization', auth.PURCHASING);
    expect(detail.body.stockDocuments).toHaveLength(2);
    expect(detail.body.lines[0].receivedBaseQty).toBe('500');
  });

  it('không cho nhận vượt số còn lại, và không ghi gì khi bị từ chối', async () => {
    const po = await createApprovedPo();
    await receive(po.id, [{ purchaseOrderLineId: po.lines[0].id, quantity: 4 }]);
    const over = await receive(po.id, [{ purchaseOrderLineId: po.lines[0].id, quantity: 2 }]);
    expect(over.status).toBe(409);
    expect(over.body.error.message).toMatch(/còn 1/);
    expect(await balanceOf(ids.cable, ids.wh)).toBe(400);
    expect(await prisma.stockDocument.count()).toBe(1);
  });

  it('hai thủ kho cùng nhận toàn bộ một lúc: chỉ một phiếu được ghi', async () => {
    const po = await createApprovedPo();
    const all = po.lines.map((l, i) => ({ purchaseOrderLineId: l.id, quantity: i === 0 ? 5 : 2 }));
    const results = await Promise.all([receive(po.id, all), receive(po.id, all), receive(po.id, all)]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(await balanceOf(ids.cable, ids.wh)).toBe(500);
  });

  it('thủ kho không được tạo đơn mua; mua hàng không được nhập kho', async () => {
    const po = await createApprovedPo();
    expect((await request(app).post('/api/purchase-orders').set('Authorization', auth.WAREHOUSE).send(poBody())).status).toBe(403);
    const res = await request(app)
      .post(`/api/purchase-orders/${po.id}/receipts`)
      .set('Authorization', auth.PURCHASING)
      .send({ lines: [{ purchaseOrderLineId: po.lines[0].id, quantity: 1 }] });
    expect(res.status).toBe(403);
  });

  it('đơn đã nhận hàng thì không huỷ được', async () => {
    const po = await createApprovedPo();
    await receive(po.id, [{ purchaseOrderLineId: po.lines[0].id, quantity: 1 }]);
    const res = await request(app).post(`/api/purchase-orders/${po.id}/cancel`).set('Authorization', auth.PURCHASING);
    expect(res.status).toBe(409);
  });

  it('tra cứu phiếu nhập kèm đơn vị và số PO', async () => {
    const po = await createApprovedPo();
    const r = await receive(po.id, [{ purchaseOrderLineId: po.lines[0].id, quantity: 1 }]);
    const list = await request(app).get('/api/stock/documents?type=RECEIPT').set('Authorization', auth.WAREHOUSE);
    expect(list.body.total).toBe(1);
    const detail = await request(app).get(`/api/stock/documents/${r.body.id}`).set('Authorization', auth.WAREHOUSE);
    expect(detail.body.lines[0]).toMatchObject({ quantity: '1', baseQuantity: '100', unit: { code: 'CUON' } });
    expect(detail.body.purchaseOrder.id).toBe(po.id);
  });
});
