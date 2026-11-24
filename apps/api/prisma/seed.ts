/**
 * Dữ liệu mẫu cho công ty thương mại vật tư cơ điện (MEP).
 * Chạy: npm run db:seed -w apps/api   (xoá toàn bộ dữ liệu cũ rồi tạo lại)
 */
import { PrismaClient, Prisma, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { nextDocNumber } from '../src/lib/docNumber.js';
import { postStockDocumentTx } from '../src/modules/stock/stock.service.js';
import { seedHistory } from './seed-history.js';

const prisma = new PrismaClient();
const D = (v: number | string) => new Prisma.Decimal(v);

export const DEMO_PASSWORD = 'Demo@123';

const users: { email: string; fullName: string; role: Role }[] = [
  { email: 'admin@vattuhub.test', fullName: 'Nguyễn Quản Trị', role: 'ADMIN' },
  { email: 'muahang@vattuhub.test', fullName: 'Trần Mua Hàng', role: 'PURCHASING' },
  { email: 'kinhdoanh@vattuhub.test', fullName: 'Lê Kinh Doanh', role: 'SALES' },
  { email: 'thukho@vattuhub.test', fullName: 'Phạm Thủ Kho', role: 'WAREHOUSE' },
  { email: 'ketoan@vattuhub.test', fullName: 'Vũ Kế Toán', role: 'ACCOUNTANT' },
];

const units: [string, string][] = [
  ['CAI', 'Cái'], ['M', 'Mét'], ['CUON', 'Cuộn'], ['CAY', 'Cây'], ['BO', 'Bộ'],
  ['THUNG', 'Thùng'], ['HOP', 'Hộp'], ['KG', 'Kg'], ['BAO', 'Bao'], ['TAM', 'Tấm'],
];

const groups: [string, string][] = [
  ['DIEN', 'Dây & cáp điện'], ['TBD', 'Thiết bị điện'], ['ONG', 'Ống & phụ kiện nước'],
  ['CHIEUSANG', 'Chiếu sáng'], ['PCCC', 'Phòng cháy chữa cháy'], ['XD', 'Vật liệu xây dựng'],
];

// [mã, tên, quy cách, nhóm, ĐVT cơ sở, giá mua, giá bán, tồn tối thiểu, quy đổi [ĐVT, hệ số][]]
type Row = [string, string, string, string, string, number, number, number, [string, number][]];
const materials: Row[] = [
  ['DC-CV1.5', 'Dây điện đơn CV 1.5mm²', '1 lõi đồng, cách điện PVC', 'DIEN', 'M', 4200, 5200, 500, [['CUON', 100]]],
  ['DC-CV2.5', 'Dây điện đơn CV 2.5mm²', '1 lõi đồng, cách điện PVC', 'DIEN', 'M', 6800, 8300, 500, [['CUON', 100]]],
  ['DC-CV4', 'Dây điện đơn CV 4mm²', '1 lõi đồng, cách điện PVC', 'DIEN', 'M', 10500, 12800, 300, [['CUON', 100]]],
  ['DC-CVV2x2.5', 'Cáp điện CVV 2x2.5mm²', '2 lõi, vỏ PVC', 'DIEN', 'M', 17500, 21000, 200, [['CUON', 100]]],
  ['DC-CXV4x16', 'Cáp điện CXV 4x16mm²', '4 lõi, cách điện XLPE', 'DIEN', 'M', 245000, 289000, 50, []],
  ['TB-MCB1P16', 'Aptomat MCB 1P 16A', '6kA, gắn thanh DIN', 'TBD', 'CAI', 68000, 89000, 50, [['HOP', 12]]],
  ['TB-MCB2P32', 'Aptomat MCB 2P 32A', '6kA, gắn thanh DIN', 'TBD', 'CAI', 185000, 235000, 30, [['HOP', 6]]],
  ['TB-RCBO2P25', 'Aptomat chống giật RCBO 2P 25A', '30mA', 'TBD', 'CAI', 420000, 520000, 20, []],
  ['TB-OC2', 'Ổ cắm đôi 3 chấu', '16A, mặt vuông', 'TBD', 'CAI', 52000, 69000, 100, [['HOP', 10]]],
  ['TB-CT1', 'Công tắc đơn 1 chiều', '10A, mặt vuông', 'TBD', 'CAI', 28000, 38000, 100, [['HOP', 10]]],
  ['TB-TUDIEN12', 'Tủ điện âm tường 12 module', 'Vỏ nhựa, cửa mờ', 'TBD', 'CAI', 310000, 395000, 10, []],
  ['ONG-PPR20', 'Ống nhựa PPR D20 PN20', 'Dài 4m/cây', 'ONG', 'M', 18500, 24000, 200, [['CAY', 4]]],
  ['ONG-PPR25', 'Ống nhựa PPR D25 PN20', 'Dài 4m/cây', 'ONG', 'M', 27500, 35000, 200, [['CAY', 4]]],
  ['ONG-PVC90', 'Ống nhựa PVC D90', 'Class 2, dài 4m/cây', 'ONG', 'M', 42000, 53000, 100, [['CAY', 4]]],
  ['ONG-CO20', 'Cút PPR D20', 'Góc 90 độ', 'ONG', 'CAI', 3500, 5000, 300, [['THUNG', 100]]],
  ['ONG-TE20', 'Tê PPR D20', 'Tê đều', 'ONG', 'CAI', 4200, 6000, 300, [['THUNG', 100]]],
  ['ONG-VAN25', 'Van cầu PPR D25', 'Tay gạt', 'ONG', 'CAI', 95000, 125000, 30, []],
  ['CS-LED18', 'Bóng LED tuýp 1m2 18W', 'Ánh sáng trắng 6500K', 'CHIEUSANG', 'CAI', 62000, 82000, 100, [['THUNG', 25]]],
  ['CS-DOWN9', 'Đèn LED âm trần 9W', 'Lỗ khoét D90', 'CHIEUSANG', 'CAI', 78000, 105000, 80, [['THUNG', 20]]],
  ['CS-PHA100', 'Đèn pha LED 100W', 'IP66', 'CHIEUSANG', 'CAI', 520000, 680000, 10, []],
  ['PC-BINH4', 'Bình chữa cháy bột ABC 4kg', 'Kèm giá treo', 'PCCC', 'CAI', 210000, 280000, 20, []],
  ['PC-DAUBAO', 'Đầu báo khói quang', '24VDC', 'PCCC', 'CAI', 145000, 195000, 30, []],
  ['PC-ONGDN25', 'Ống thép mạ kẽm DN25', 'Dài 6m/cây', 'PCCC', 'M', 72000, 92000, 60, [['CAY', 6]]],
  ['XD-XM40', 'Xi măng PCB40', 'Bao 50kg', 'XD', 'BAO', 82000, 95000, 100, []],
  ['XD-THEP10', 'Thép thanh vằn D10', 'CB300', 'XD', 'KG', 15500, 17800, 1000, [['CAY', 7.22]]],
  ['XD-THACHCAO', 'Tấm thạch cao 9mm', '1220x2440', 'XD', 'TAM', 98000, 125000, 50, []],
];

const warehouses = [
  { code: 'KHO-TM', name: 'Kho tổng Tây Mỗ', address: 'Đại Lộ Thăng Long, Tây Mỗ, Hà Nội', type: 'MAIN' as const },
  { code: 'KHO-HD', name: 'Kho Hoài Đức', address: 'An Khánh, Hoài Đức, Hà Nội', type: 'MAIN' as const },
  { code: 'CT-NTL', name: 'Kho công trình Nam Từ Liêm', address: 'Mỹ Đình, Nam Từ Liêm, Hà Nội', type: 'SITE' as const },
];

const suppliers: [string, string, string, string][] = [
  ['NCC-CDV', 'Công ty TNHH Cáp Điện Việt', '0101234561', '0243 555 0101'],
  ['NCC-TBDA', 'Công ty CP Thiết Bị Điện Á Châu', '0101234562', '0243 555 0102'],
  ['NCC-NHUA', 'Công ty TNHH Nhựa Kỹ Thuật Hà Nội', '0101234563', '0243 555 0103'],
  ['NCC-ANHSANG', 'Công ty CP Chiếu Sáng Ánh Dương', '0101234564', '0243 555 0104'],
  ['NCC-PCCC', 'Công ty TNHH PCCC An Toàn', '0101234565', '0243 555 0105'],
];

const customers: [string, string, string, string][] = [
  ['KH-XDHN', 'Công ty CP Xây Dựng Hà Nội Số 5', '0109876541', '0912 000 001'],
  ['KH-MEPVN', 'Công ty TNHH Cơ Điện MEP Việt Nam', '0109876542', '0912 000 002'],
  ['KH-NHAXANH', 'Công ty CP Đầu Tư Nhà Xanh', '0109876543', '0912 000 003'],
  ['KH-THANHCONG', 'Nhà thầu Thành Công', '0109876544', '0912 000 004'],
];

async function main() {
  console.log('Xoá dữ liệu cũ...');
  await prisma.$executeRawUnsafe(`
    TRUNCATE "DebtEntry","Payment","StockLedger","StockBalance","StockDocumentLine","StockDocument",
             "SalesOrderLine","SalesOrder","QuotationLine","Quotation","PurchaseOrderLine","PurchaseOrder",
             "UnitConversion","Material","MaterialGroup","Unit","Warehouse","Supplier","Customer",
             "DocumentSequence","User" RESTART IDENTITY CASCADE`);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await prisma.user.createMany({ data: users.map((u) => ({ ...u, passwordHash })) });
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@vattuhub.test' } });

  await prisma.unit.createMany({ data: units.map(([code, name]) => ({ code, name })) });
  await prisma.materialGroup.createMany({ data: groups.map(([code, name]) => ({ code, name })) });
  const unitId = new Map((await prisma.unit.findMany()).map((u) => [u.code, u.id]));
  const groupId = new Map((await prisma.materialGroup.findMany()).map((g) => [g.code, g.id]));

  for (const [code, name, specification, g, baseUnit, buy, sell, min, conv] of materials) {
    await prisma.material.create({
      data: {
        code,
        name,
        specification,
        groupId: groupId.get(g)!,
        baseUnitId: unitId.get(baseUnit)!,
        purchasePrice: D(buy),
        salePrice: D(sell),
        minStock: D(min),
        conversions: { create: conv.map(([u, factor]) => ({ unitId: unitId.get(u)!, factor: D(factor) })) },
      },
    });
  }

  await prisma.warehouse.createMany({ data: warehouses });
  await prisma.supplier.createMany({
    data: suppliers.map(([code, name, taxCode, phone]) => ({ code, name, taxCode, phone, address: 'Hà Nội' })),
  });
  await prisma.customer.createMany({
    data: customers.map(([code, name, taxCode, phone]) => ({ code, name, taxCode, phone, address: 'Hà Nội' })),
  });

  // Tồn đầu kỳ: mỗi kho một phiếu điều chỉnh, ghi sổ qua đúng service thật.
  console.log('Tạo tồn đầu kỳ...');
  const allMaterials = await prisma.material.findMany({ orderBy: { id: 'asc' } });
  const allWarehouses = await prisma.warehouse.findMany({ orderBy: { id: 'asc' } });
  for (const [wi, w] of allWarehouses.entries()) {
    const ratio = w.type === 'SITE' ? 0.3 : wi === 0 ? 3 : 1.5;
    const lines = allMaterials
      // Kho công trình chỉ giữ một phần vật tư; vài mã để dưới mức tối thiểu cho cảnh báo tồn thấp.
      .filter((_, i) => w.type !== 'SITE' || i % 2 === 0)
      .map((m, i) => {
        const qty = m.minStock.mul(ratio).mul(i % 7 === 3 ? 0.2 : 1).toDecimalPlaces(0);
        return {
          materialId: m.id,
          unitId: m.baseUnitId,
          factor: D(1),
          quantity: qty,
          baseQuantity: qty,
          unitPrice: m.purchasePrice,
          amount: qty.mul(m.purchasePrice),
        };
      });
    await prisma.$transaction(async (tx) => {
      const doc = await tx.stockDocument.create({
        data: {
          code: await nextDocNumber(tx, 'DC'),
          type: 'ADJUSTMENT',
          warehouseId: w.id,
          note: 'Tồn đầu kỳ',
          totalAmount: lines.reduce((s, l) => s.plus(l.amount), D(0)),
          createdById: admin.id,
          lines: { create: lines },
        },
      });
      await postStockDocumentTx(tx, doc.id, admin.id);
    });
  }

  console.log('Sinh lịch sử giao dịch 90 ngày...');
  const stats = await seedHistory(prisma);
  console.log(
    `  ${stats.po} đơn mua, ${stats.so} đơn bán (${stats.deliveries} đã giao), ${stats.payments} phiếu thu/chi`,
  );

  const [ledgerCount, value] = await Promise.all([
    prisma.stockLedger.count(),
    prisma.$queryRaw<{ v: string }[]>`
      SELECT SUM(b."quantity" * m."purchasePrice")::text AS v
      FROM "StockBalance" b JOIN "Material" m ON m.id = b."materialId"`,
  ]);
  console.log(
    `Xong: ${users.length} người dùng, ${materials.length} vật tư, ${warehouses.length} kho, ${ledgerCount} dòng sổ kho.`,
  );
  console.log(`Giá trị tồn kho hiện tại: ${Number(value[0].v).toLocaleString('vi-VN')} đ`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
