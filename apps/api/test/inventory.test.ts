import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { postStockDocument } from '../src/modules/stock/stock.service.js';
import { balanceOf, createUser, D, draftDoc, resetDb } from './helpers.js';

const app = createApp();
afterAll(() => prisma.$disconnect());

let token: string;
let salesToken: string;
let ids: { a: number; b: number; cable: number; mcb: number; m: number; cuon: number; cai: number; user: number };

beforeEach(async () => {
  await resetDb();
  const user = await createUser('WAREHOUSE');
  await createUser('SALES');
  token = 'Bearer ' + (await request(app).post('/api/auth/login').send({ email: 'warehouse@test.local', password: 'Secret@123' })).body.token;
  salesToken = 'Bearer ' + (await request(app).post('/api/auth/login').send({ email: 'sales@test.local', password: 'Secret@123' })).body.token;

  const [m, cuon, cai] = await Promise.all(
    [['M', 'Mét'], ['CUON', 'Cuộn'], ['CAI', 'Cái']].map(([code, name]) => prisma.unit.create({ data: { code, name } })),
  );
  const group = await prisma.materialGroup.create({ data: { code: 'DIEN', name: 'Điện' } });
  const cable = await prisma.material.create({
    data: {
      code: 'DC-CV2.5', name: 'Dây CV 2.5', groupId: group.id, baseUnitId: m.id, purchasePrice: D(6800), minStock: D(500),
      conversions: { create: [{ unitId: cuon.id, factor: D(100) }] },
    },
  });
  const mcb = await prisma.material.create({
    data: { code: 'TB-MCB', name: 'Aptomat', groupId: group.id, baseUnitId: cai.id, purchasePrice: D(68000), minStock: D(5) },
  });
  const a = await prisma.warehouse.create({ data: { code: 'A', name: 'Kho tổng' } });
  const b = await prisma.warehouse.create({ data: { code: 'B', name: 'Kho công trình', type: 'SITE' } });
  ids = { a: a.id, b: b.id, cable: cable.id, mcb: mcb.id, m: m.id, cuon: cuon.id, cai: cai.id, user: user.id };

  const doc = await draftDoc({
    type: 'RECEIPT', warehouseId: a.id, userId: user.id,
    lines: [{ materialId: cable.id, unitId: m.id, qty: 1000 }, { materialId: mcb.id, unitId: cai.id, qty: 20 }],
  });
  await postStockDocument(doc.id, user.id);
});

describe('Chuyển kho', () => {
  it('chuyển theo đơn vị quy đổi: trừ kho xuất, cộng kho nhận, ghi giá trị theo giá mua', async () => {
    const res = await request(app)
      .post('/api/stock/transfers')
      .set('Authorization', token)
      .send({ fromWarehouseId: ids.a, toWarehouseId: ids.b, lines: [{ materialId: ids.cable, unitId: ids.cuon, quantity: 3 }] });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^PC-/);
    expect(res.body.status).toBe('POSTED');
    expect(await balanceOf(ids.cable, ids.a)).toBe(700);
    expect(await balanceOf(ids.cable, ids.b)).toBe(300);
    expect(res.body.totalAmount).toBe('2040000'); // 3 cuộn × 100 m × 6.800
  });

  it('từ chối cùng kho, thiếu hàng, và vai trò không phải thủ kho', async () => {
    const same = await request(app)
      .post('/api/stock/transfers')
      .set('Authorization', token)
      .send({ fromWarehouseId: ids.a, toWarehouseId: ids.a, lines: [{ materialId: ids.cable, unitId: ids.m, quantity: 1 }] });
    expect(same.status).toBe(400);
    expect(same.body.error.details.fieldErrors.toWarehouseId[0]).toMatch(/khác kho xuất/);

    const short = await request(app)
      .post('/api/stock/transfers')
      .set('Authorization', token)
      .send({ fromWarehouseId: ids.b, toWarehouseId: ids.a, lines: [{ materialId: ids.cable, unitId: ids.m, quantity: 1 }] });
    expect(short.status).toBe(409);
    expect(await prisma.stockDocument.count({ where: { type: 'TRANSFER' } })).toBe(0);

    const bySales = await request(app)
      .post('/api/stock/transfers')
      .set('Authorization', salesToken)
      .send({ fromWarehouseId: ids.a, toWarehouseId: ids.b, lines: [{ materialId: ids.cable, unitId: ids.m, quantity: 1 }] });
    expect(bySales.status).toBe(403);
  });
});

describe('Kiểm kê', () => {
  it('tạo điều chỉnh đúng phần chênh lệch, lưu tồn sổ và số đếm', async () => {
    const res = await request(app)
      .post('/api/stock/counts')
      .set('Authorization', token)
      .send({
        warehouseId: ids.a,
        note: 'Kiểm kê cuối tháng 11',
        lines: [
          { materialId: ids.cable, countedQty: 985 }, // hao hụt 15 m
          { materialId: ids.mcb, countedQty: 20 }, // khớp
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^KK-/);
    const cableLine = res.body.lines.find((l: { materialId: number }) => l.materialId === ids.cable);
    expect(cableLine).toMatchObject({ bookQty: '1000', countedQty: '985', baseQuantity: '-15' });
    expect(res.body.totalAmount).toBe('-102000'); // -15 × 6.800
    expect(await balanceOf(ids.cable, ids.a)).toBe(985);
    expect(await balanceOf(ids.mcb, ids.a)).toBe(20);
    // Dòng khớp sổ không sinh biến động kho.
    expect(await prisma.stockLedger.count({ where: { documentId: res.body.id } })).toBe(1);
  });

  it('kiểm kê vật tư chưa từng có trong kho thì ghi tăng', async () => {
    const res = await request(app)
      .post('/api/stock/counts')
      .set('Authorization', token)
      .send({ warehouseId: ids.b, lines: [{ materialId: ids.mcb, countedQty: 3 }] });
    expect(res.status).toBe(201);
    expect(await balanceOf(ids.mcb, ids.b)).toBe(3);
  });

  it('chênh lệch tính theo tồn tại thời điểm ghi, kể cả khi vừa có phiếu xuất chen vào', async () => {
    // Thủ kho đếm được 990 m khi sổ đang là 1000. Trước khi bấm lưu, có phiếu chuyển 100 m đi.
    await request(app)
      .post('/api/stock/transfers')
      .set('Authorization', token)
      .send({ fromWarehouseId: ids.a, toWarehouseId: ids.b, lines: [{ materialId: ids.cable, unitId: ids.m, quantity: 100 }] });
    const res = await request(app)
      .post('/api/stock/counts')
      .set('Authorization', token)
      .send({ warehouseId: ids.a, lines: [{ materialId: ids.cable, countedQty: 890 }] });
    expect(res.body.lines[0]).toMatchObject({ bookQty: '900', baseQuantity: '-10' });
    expect(await balanceOf(ids.cable, ids.a)).toBe(890);
  });
});

describe('Tồn kho và thẻ kho', () => {
  it('bảng tồn theo kho, tổng các kho, giá trị và lọc dưới mức tối thiểu', async () => {
    await request(app)
      .post('/api/stock/transfers')
      .set('Authorization', token)
      .send({ fromWarehouseId: ids.a, toWarehouseId: ids.b, lines: [{ materialId: ids.mcb, unitId: ids.cai, quantity: 18 }] });

    const all = await request(app).get('/api/stock/overview').set('Authorization', salesToken);
    expect(all.body.total).toBe(2);
    expect(all.body.items.find((r: { code: string }) => r.code === 'TB-MCB').quantity).toBe('20');
    expect(all.body.totalValue).toBe(String(1000 * 6800 + 20 * 68000));

    const atA = await request(app).get(`/api/stock/overview?warehouseId=${ids.a}&lowStock=true`).set('Authorization', salesToken);
    expect(atA.body.items.map((r: { code: string }) => r.code)).toEqual(['TB-MCB']); // còn 2 < 5

    const search = await request(app).get('/api/stock/overview?q=cv2').set('Authorization', salesToken);
    expect(search.body.items).toHaveLength(1);
  });

  it('thẻ kho: tồn đầu, nhập, xuất, tồn sau từng phát sinh, tồn cuối', async () => {
    await request(app)
      .post('/api/stock/transfers')
      .set('Authorization', token)
      .send({ fromWarehouseId: ids.a, toWarehouseId: ids.b, lines: [{ materialId: ids.cable, unitId: ids.cuon, quantity: 2 }] });
    await request(app)
      .post('/api/stock/counts')
      .set('Authorization', token)
      .send({ warehouseId: ids.a, lines: [{ materialId: ids.cable, countedQty: 795 }] });

    const card = await request(app)
      .get(`/api/stock/card?materialId=${ids.cable}&warehouseId=${ids.a}`)
      .set('Authorization', token);
    expect(card.status).toBe(200);
    expect(card.body).toMatchObject({ opening: '0', totalIn: '1000', totalOut: '205', closing: '795' });
    expect(card.body.rows.map((r: { balance: string }) => r.balance)).toEqual(['1000', '800', '795']);
    expect(card.body.rows[1].partner).toBe('→ Kho công trình');

    // Lọc từ ngày mai: mọi phát sinh hôm nay thành tồn đầu kỳ.
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const later = await request(app)
      .get(`/api/stock/card?materialId=${ids.cable}&warehouseId=${ids.a}&from=${tomorrow}`)
      .set('Authorization', token);
    expect(later.body).toMatchObject({ opening: '795', closing: '795', rows: [] });
  });
});
