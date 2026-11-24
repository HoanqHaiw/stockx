import bcrypt from 'bcryptjs';
import { Prisma, type Role, type StockDocumentType } from '@prisma/client';
import { prisma } from '../src/lib/prisma.js';
import { nextDocNumber } from '../src/lib/docNumber.js';

export const D = (v: number | string) => new Prisma.Decimal(v);

export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE "DebtEntry","Payment","StockLedger","StockBalance","StockDocumentLine","StockDocument",
             "SalesOrderLine","SalesOrder","QuotationLine","Quotation","PurchaseOrderLine","PurchaseOrder",
             "UnitConversion","Material","MaterialGroup","Unit","Warehouse","Supplier","Customer",
             "DocumentSequence","User" RESTART IDENTITY CASCADE`);
}

export async function createUser(
  role: Role = 'ADMIN',
  email = `${role.toLowerCase()}@test.local`,
  password = 'Secret@123',
) {
  return prisma.user.create({
    data: { email, fullName: `User ${role}`, role, passwordHash: await bcrypt.hash(password, 4) },
  });
}

export async function createBasics() {
  const user = await createUser('WAREHOUSE');
  const unit = await prisma.unit.create({ data: { code: 'M', name: 'Mét' } });
  const roll = await prisma.unit.create({ data: { code: 'CUON', name: 'Cuộn' } });
  const group = await prisma.materialGroup.create({ data: { code: 'DIEN', name: 'Điện' } });
  const material = await prisma.material.create({
    data: {
      code: 'DC-CV2.5',
      name: 'Dây CV 2.5',
      groupId: group.id,
      baseUnitId: unit.id,
      conversions: { create: [{ unitId: roll.id, factor: D(100) }] },
    },
  });
  const material2 = await prisma.material.create({
    data: { code: 'DC-CV4', name: 'Dây CV 4', groupId: group.id, baseUnitId: unit.id },
  });
  const whA = await prisma.warehouse.create({ data: { code: 'A', name: 'Kho A' } });
  const whB = await prisma.warehouse.create({ data: { code: 'B', name: 'Kho B' } });
  return { user, unit, roll, material, material2, whA, whB };
}

/** Tạo phiếu kho ở trạng thái nháp. Số lượng tính theo đơn vị cơ sở. */
export async function draftDoc(opts: {
  type: StockDocumentType;
  warehouseId: number;
  toWarehouseId?: number;
  userId: number;
  lines: { materialId: number; unitId: number; qty: number }[];
}) {
  return prisma.$transaction(async (tx) =>
    tx.stockDocument.create({
      data: {
        code: await nextDocNumber(tx, opts.type),
        type: opts.type,
        warehouseId: opts.warehouseId,
        toWarehouseId: opts.toWarehouseId,
        createdById: opts.userId,
        lines: {
          create: opts.lines.map((l) => ({
            materialId: l.materialId,
            unitId: l.unitId,
            factor: D(1),
            quantity: D(l.qty),
            baseQuantity: D(l.qty),
          })),
        },
      },
    }),
  );
}

export async function balanceOf(materialId: number, warehouseId: number) {
  const b = await prisma.stockBalance.findUnique({
    where: { materialId_warehouseId: { materialId, warehouseId } },
  });
  return b ? Number(b.quantity) : 0;
}
